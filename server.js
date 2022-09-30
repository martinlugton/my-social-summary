const express = require('express');
const app = express();
const port = 3000;

const fs = require('fs');

function isvalidTwitterUsername (input) {
	for (let i = 0; i < input.length ; i++) {
		character_code = input.charCodeAt(i);
		if (!(character_code > 47 && character_code < 58) && // numeric (0-9)
        	!(character_code > 64 && character_code < 91) && // upper alpha (A-Z)
        	!(character_code > 96 && character_code < 123) && // lower alpha (a-z)
		!(character_code == 95)) { // underscore
		      return false;
  	  	}
	}
	return true;
}

app.get('/', (req, res) => {
	res.send('Hello World!');
});

app.get('/:username/:timestamp', (req, res) => {
	console.log("Request made to /:username/:timestamp:");
	console.log(req.params);
        if (!isvalidTwitterUsername(req.params.username)) {
                console.log("Provided username parameter " + req.params.username + " is not valid");
		res.send("Provided username parameter " + req.params.username + " is not valid");
		return;
        }
        if (isNaN(req.params.timestamp)) {
                console.log("Provided timestamp parameter " + req.params.timestamp + " is not a number");
		res.send("Provided timestamp parameter " + req.params.timestamp + " is not a number");
		return;
        }
        fs.readFile('./users/' + req.params.username + '/' + req.params.timestamp + '.html', 'utf8', (err, data) => {
                if (err) {
                        console.error(err);
                        return;
                }
                res.send(data);
        });
});


app.listen(port, () => {
	console.log('Example app is listening on port ' + port);
});
