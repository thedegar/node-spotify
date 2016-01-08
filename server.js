var unirest = require('unirest');
var express = require('express');
var events = require('events');
var async = require('async');

var getFromApi = function(endpoint, args) {
    var emitter = new events.EventEmitter();
    unirest.get('https://api.spotify.com/v1/' + endpoint)
           .qs(args)
           .end(function(response) {
                if (response.ok) {
                    emitter.emit('end', response.body);
                }
                else {
                    emitter.emit('error', response.code);
                }
            });
    return emitter;
};

var app = express();
app.use(express.static('public'));

app.get('/search/:name', function(req, res) {
    var searchReq = getFromApi('search', {
        q: req.params.name,
        limit: 20,
        type: 'artist'
    });
    
    var errorCheck = false;

    searchReq.on('end', function(item) {
        var artist = item.artists.items[0];
        var relatedArtists = getFromApi('artists/'+artist.id+'/related-artists');
        
        relatedArtists.on('end', function(item) {
            artist.related = item.artists;
            
            var countArtists = 0;
            
            var checkComplete = function() {
                if (countArtists === artist.related.length) {
                    res.json(artist);
                }
                //console.log('Check Complete hit');
                //console.log('countArtists = '+countArtists);
                //console.log('artist.related.length = '+artist.related.length);
            };
            
            //This was the attempt without using async module
            //I couldn't find a way to match the async reply with the right index position of artist.related
            
            /*for (var i in artist.related) {
                var topSongs = getFromApi('artists/'+artist.related[i].id+'/top-tracks?country=US');
                
                topSongs.on('end', function(item) {
                    artist.related[countArtists].tracks = item.tracks;
                    countArtists += 1;
                    checkComplete();
                });
                
                topSongs.on('error', function(code) {
                    if (artist.related.length === false) {
                        res.sendStatus(code);
                        artist.related.length = true;
                    }
                });
            }*/
            
            //Here is the start of using async module for top-tracks
            var idArray = [];
            
            for (var i in artist.related) {
                idArray.push(artist.related[i].id);
            }
            
            async.each(idArray,
                function(id) {
                    var topSongs = getFromApi('artists/'+id+'/top-tracks?country=US');
                    
                    topSongs.on('end', function(item) {
                        for (var j in artist.related) {
                            if (id === artist.related[j].id) {
                                artist.related[j].tracks = item.tracks;
                            }
                        }
                        countArtists += 1;
                        if (countArtists === artist.related.length) {
                            res.json(artist);
                            console.log('HIT');
                        }
                    });
                    
                    topSongs.on('error', function(code) {
                        if (errorCheck === false) {
                            res.sendStatus(code);
                            errorCheck = true;
                        }
                    });
                }, 
                checkComplete() //Can't explain why this runs before all calls are done.
            );
        });
        
        relatedArtists.on('error', function(code) {
            if (errorCheck === false) {
                res.sendStatus(code);
                errorCheck = true;
            }
        });
    });

    searchReq.on('error', function(code) {
        if (errorCheck === false) {
            res.sendStatus(code);
            errorCheck = true;
        }
    });
});

app.listen(8080);