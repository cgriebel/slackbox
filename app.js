var express       = require('express');
var bodyParser    = require('body-parser');
var request       = require('request');
var dotenv        = require('dotenv');
var SpotifyWebApi = require('spotify-web-api-node');

dotenv.load();

var responsePrefix = "Slackbox: ";

var spotifyApi = new SpotifyWebApi({
  clientId     : process.env.SPOTIFY_KEY,
  clientSecret : process.env.SPOTIFY_SECRET,
  redirectUri  : process.env.SPOTIFY_REDIRECT_URI
});

function slack(res, message) {
  if (process.env.SLACK_OUTGOING === 'true') {
    return res.send(JSON.stringify({text:  responsePrefix + message}));
  } else {
    return res.send(message);
  }
}

var app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({
  extended: true
}));

app.get('/', function(req, res) {
  if (spotifyApi.getAccessToken()) {
    return res.send('You are logged in.');
  }
  return res.send('<a href="/authorise">Authorise</a> <p>I updated...</p>');
});

app.get('/authorise', function(req, res) {
  var scopes = ['playlist-modify-public', 'playlist-modify-private'];
  var state  = new Date().getTime();
  var authoriseURL = spotifyApi.createAuthorizeURL(scopes, state);
  res.redirect(authoriseURL);
});

app.get('/callback', function(req, res) {
  spotifyApi.authorizationCodeGrant(req.query.code)
    .then(function(data) {
      spotifyApi.setAccessToken(data.body['access_token']);
      spotifyApi.setRefreshToken(data.body['refresh_token']);
      return res.redirect('/');
    }, function(err) {
      return res.send(err);
    });
});

app.use('/store', function(req, res, next) {
  if (req.body.token !== process.env.SLACK_TOKEN) {
    return slack(res.status(500), 'Cross site request forgerizzle!');
  }
  next();
});

app.post('/store', function(req, res) {
  if(req.body.text.indexOf(responsePrefix) !== -1)
  {
    return;
  }
  spotifyApi.refreshAccessToken()
    .then(function(data) {
      spotifyApi.setAccessToken(data.body['access_token']);
      if (data.body['refresh_token']) {
        spotifyApi.setRefreshToken(data.body['refresh_token']);
      }
      if (req.body.text.trim().length === 0) {
          return res.send('Enter the name of a song and the name of the artist, separated by a "-"\nExample: Blue (Da Ba Dee) - Eiffel 65');
      }
      var text = process.env.SLACK_OUTGOING === 'true' ? req.body.text.replace(req.body.trigger_word, '') : req.body.text;
      
      
      
      // var text = req.body.text.substring(0, req.body.text - 1);
      // if(text.indexOf('spotify:track:') === -1)
      // {
      //   return;// slack(res, 'Enter a spotify URI\nExample: spotify:track:1rIFZk9tTUtHP3vULR5wXe');
      // }
      // else{



        // if(text.indexOf(' - ') === -1) {
        //   var query = 'track:' + text;
        // } else {
        //   var pieces = text.split(' - ');
        //   var query = 'artist:' + pieces[0].trim() + ' track:' + pieces[1].trim();
        // }

          message += '\nHard coded: ' + '[spotify:track:0iq3MFEbuKTWJgdhwdOwXI]';
          message += '\nPassed: [' + text + "]";
          return slack(res, message);

        spotifyApi.searchTracks(query)
          .then(function(data) {
            var results = data.body.tracks.items;
            if (results.length === 0) {
              return slack(res, 'Could not find that track.');
            }
            var track = results[0];
            spotifyApi.addTracksToPlaylist(process.env.SPOTIFY_USERNAME, process.env.SPOTIFY_PLAYLIST_ID, ['spotify:track:0iq3MFEbuKTWJgdhwdOwXI'])
              .then(function(data) {
                var message = 'Track added' + (process.env.SLACK_OUTGOING === 'true' ? ' by *' + req.body.user_name + '*' : '') + ': *' + track.name + '* by *' + track.artists[0].name + '*' + "\n " + 'spotify:track:' + track.id;
                message += '\nHard coded: ' + 'spotify:track:0iq3MFEbuKTWJgdhwdOwXI';
                message += '\nPassed: ' + text;
                return slack(res, message);
              }, function(err) {
                return slack(res, "Requested Track: [" + text + "] Error: [" + err.message + "]");
              });
          }, function(err) {
            return slack(res, err.message);
          });
      //}
    }, function(err) {
      return slack(res, 'Could not refresh access token. You probably need to re-authorise yourself from your app\'s homepage.');
    });
});

app.set('port', (process.env.PORT || 5000));
app.listen(app.get('port'));
