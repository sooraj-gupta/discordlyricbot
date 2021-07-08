'use strict'
//importing required libraries
require('dotenv').config();
const Discord = require('discord.js');
const client = new Discord.Client();
const MUSIXMATCHKEY = "83ff4ead3ace8c3aa2deb86f310ea93f"
const prefix = "%"
const https = require('https')
var request = require('request');
const EventEmitter = require('events');
const musixmatch = "https://api.musixmatch.com/ws/1.1/"
const ytdl = require( "ytdl-core" );
const ytsearch = require( 'yt-search' );

const apiParams = {
    getlyricsbysong: "matcher.lyrics.get",
    getlyricsbyid: "track.lyrics.get",
    search: "track.search"
}

const states = {
    DEFAULT: "default",
    NUMBER: "number"
}

let trackQuery = "";

let state = states.DEFAULT

function httpRequest( params, requestType, callback )
{
    let keys = Object.keys( params )
    let paramUrl = "?format=json&";

    keys.forEach( e => {
        paramUrl += e + "=" + encodeURIComponent( params[ e ] ) + "&"
    })
    
    let url = musixmatch + 
              requestType +
              paramUrl +
              "&page_size=20" +
              "&s_track_rating=desc" +
              "&s_artist_rating=desc" +
              "&apikey=" + MUSIXMATCHKEY

    https.get(url, function(res){
        var body = '';
        res.on('data', chunk => {
            body += chunk;
        });
        res.on('end', function(){
            let jsonRes = JSON.parse( body.slice(body.indexOf( "{"), body.lastIndexOf( "}") + 1  ) );
            callback( jsonRes );
        });
    }).on('error', function(e){
        console.log("Got an error: ", e);
    });
}

let emmiter = new EventEmitter();

const getTracksByQuery = ( message, query, params, category ) => {
    httpRequest( params, apiParams.search, (res) => { 
        let msg = "";
        let obj = res.message.body.track_list;
        if ( obj )
            obj.forEach( (e, i) =>{
                msg += `${ i + 1 }. **${e.track.track_name}** (${e.track.artist_name}) \n`;
            })
        let embed = new Discord.MessageEmbed()
                    .setTitle( `Tracks by the ${category} **"${ query.join( " " ) }"**` )
                    .setDescription( msg.slice( 0,4096 ) ) ;
        message.channel.send( embed );
        message.channel.send( "Choose a track number from the list above" );
        state = states.NUMBER;
        emmiter.removeAllListeners()
        const handleTrackSelection = async ( args ) => {
            let num = args.num - 1;
            let tracks = obj.map( a => ({ 
                                            track: a.track.track_name, 
                                            author: a.track.artist_name, 
                                            id: a.track.track_id,
                                            url: a.track.track_share_url,
                                        }));
            if( args.num <= tracks.length )
            {
                message.reply( "Getting lyrics for **" + tracks[num].track + "** by " + tracks[num].author +"..." )
                trackQuery = tracks[num].track + " by " + tracks[num].author;
                const videos = await ytsearch( trackQuery )      
                httpRequest( { track_id: tracks[ num ].id }, apiParams.getlyricsbyid, ( json ) => {
                    if( json.message.body )
                    {
                        let lyrics = json.message.body.lyrics.lyrics_body;
                        message.channel.send( new Discord.MessageEmbed().setDescription( lyrics.slice( 0, lyrics.indexOf( "******* T" ) ) + "\n [More Lyrics...](" + tracks[ num ].url + ") \n [Video]("+ videos.videos[0].url +")" ) );
                    }
                })
            }
            else  
                message.channel.send( "The number you chose was out of bounds" );

        }
        emmiter.on( 'trackselected', handleTrackSelection );
    })
}

const commands = 
{
    help:
    {
        description: "Displays help menu",
        func: ( message ) => 
        {
            let msg = ""
            Object.keys( commands ).forEach( key => {
                msg += "`" + key + "` " + commands[key].description + "\n"
            })
            msg += "\n\nExample command:    `%q Blinding Lights The Weeknd`"
            message.channel.send( new Discord.MessageEmbed()
                .setTitle( "Bot Help")
                .setColor( 0x00ff00 )
                .setDescription( msg )
                .setThumbnail('https://res.cloudinary.com/practicaldev/image/fetch/s--CT4BsRWH--/c_fill,f_auto,fl_progressive,h_320,q_auto,w_320/https://dev-to-uploads.s3.amazonaws.com/uploads/organization/profile_image/2736/f920082b-79f1-40e5-ac80-693bd900b716.png')  
            )
        }
    },
    artist:
    {
        description: "Search for tracks with artist name",
        func: ( message ) => 
        {
            let query = message.content.split( " " ).slice( 1 ) 
            getTracksByQuery( message, query, { q_artist: query }, "artist" )
        }
    },

    lyrics:
    {
        description: "Search for tracks with certain lyrics",
        func: ( message ) => 
        {
            let query = message.content.split( " " ).slice( 1 ) 
            getTracksByQuery( message, query, { q_lyrics: query }, "lyrics" )
        }
    },

    track:
    {
        description: "Search for tracks with track name",
        func: ( message ) => 
        {
            let query = message.content.split( " " ).slice( 1 ) 
            getTracksByQuery( message, query, { q_track: query }, "track name" )
        }
    },

    q:
    {
        description: "Search for anything",
        func: ( message ) => 
        {
            let query = message.content.split( " " ).slice( 1 ) 
            getTracksByQuery( message, query, { q: query }, "query" )
        }
    },

    play:
    {
        description: "Plays the last selected song in a voice channel",
        func: async ( message ) => {
            if (message.member.voice.channel) {
                const connection = await message.member.voice.channel.join();
                if( !trackQuery )
                {
                    message.reply( "No track is selected" )
                    return
                }
                message.reply( "Playing " + trackQuery ) 
                const videos = await ytsearch( trackQuery )                
                const stream = ytdl( videos.videos[0].url, { filter: "audioonly" } );
                global.dispatcher = connection.play( stream, { seek: 0, volume: 1} );
            }
            else
            {
                message.reply( "Please join a voice channel" );
            }
        }
    },
    pause:
    {
        func: (message) => {
            global.dispatcher.pause();
        }
    },
    resume:
    {
        func: (message) => {
            global.dispatcher.resume();
        }
    },
    stop: 
    {
        func: async ( message ) => {
            if (message.member.voice.channel) {
                const connection = await message.member.voice.channel.leave();
                message.reply( "Stopping audio stream.." );
            }
        }
    }
}

//event listeners
client.once( "ready", () => {
    console.log( 'ready' );
})
client.once( "reconnecting", () => {
    console.log( "reconnecting" );
})
client.once( "disconnect", () => {
    console.log( "disconnected" );
})

//when message is sent
client.on( "message", async (message) => {
    if( !message.content.startsWith( prefix ) || message.author.bot ) 
    {
        return;
    }

    let key = message.content.slice( prefix.length ).split( " " )[0]; 
    if( state == states.DEFAULT )
        commands[key] && commands[key].func( message );

    else if( state == states.NUMBER )
    {
        let num = parseInt( key );
        console.log( num )
        if( !isNaN( num ) )
        {
            emmiter.emit( 'trackselected', { num: parseInt( num ) } );
        }
        else
        {
            commands[key] && commands[key].func( message );
        }
        state = states.DEFAULT;
    }
})

client.login( process.env.DISCORD_TOKEN );