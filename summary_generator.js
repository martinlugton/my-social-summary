require('dotenv').config()

bearerToken = process.env.TWITTER_BEARER_TOKEN;
const { TwitterApi } = require('twitter-api-v2');
const appOnlyClient = new TwitterApi(bearerToken);
const v2Client = appOnlyClient.v2;

const axios = require('axios');

const fs = require('fs');
const { parse } = require('csv-parse/sync');

var openCSV = function () {
        try {
                const data = fs.readFileSync('./users/user_preferences.csv', 'utf8');
                return data;
        } catch (err) {
                console.error(err);
        }
}

var parseCSV = function (input) {
        const records = parse(input, {
                columns: true,
                skip_empty_lines: true,
        });
        object_to_return = []
        for (const individual_line of records) {
                object_to_return.push(individual_line);
        }
        return object_to_return;
}

var openandParseCSV = function () {
        raw_input_to_parse = openCSV();
        parsed_data = parseCSV(raw_input_to_parse);
        return parsed_data;
}

var turnParsedCSVintoList = function (input) {
        list_to_return = [];
        list_to_return.push([input[0].email_address, input[0].username, [[input[0].list_or_search_specifier, input[0].list_id_or_search_term, input[0].number_of_items_to_return]]]); // add the first item to the list to get things going

        for (const line of input) {
                for (const item of list_to_return) {
                        //console.log("item to return is currently: ");
                        //console.log(item);
                        any_matches_for_this_email_address = false;
                        if (item[0] == line.email_address) { // if we've seen this email address before
                                any_matches_for_this_email_address = true;
				was_this_preference_item_already_present = false;
                                for (preference_item of item[2]) {
                                        //console.log("Here is the preference item we will test the [1]th element of against the list id or search term");
					//console.log(preference_item);
                                        if (preference_item[1] ==  line.list_id_or_search_term) { // if this was already present
                                                was_this_preference_item_already_present = true;
                                        }
                                }
                                // If this wasn't already present, add it. (This is to catch the last pass through)
                                if (was_this_preference_item_already_present == false) {
					//console.log("This preference item was not already present. Add it");
					item[2].push([line.list_or_search_specifier, line.list_id_or_search_term, line.number_of_items_to_return]);
                                }
                        }
                }
                // If this email address is not already present, add it for the first time
	                if (any_matches_for_this_email_address == false) {
                                list_to_return.push([line.email_address, line.username ,[[line.list_or_search_specifier, line.list_id_or_search_term, line.number_of_items_to_return]]]);
                        }
        }
        return list_to_return;
}

var countNumberofOccurencesinArray = function(array, target) {
        count = 0;
        array.forEach(element => {
                if (element == target){
                        count++;
                }
        });
        return count;
}

var countNumberofOccurencesinTweetArray = function(array, target) {
        count = 0;
        array.forEach(element => {
                if (element.id == target){
                        count++;
                }
        });
        return count;
}

var getBestRecentTweets = async function(search_or_list, list_id_or_search_query, number_of_items_to_return) {
	try {   
		yesterday_date = new Date();
                yesterday_date.setDate(yesterday_date.getDate()-1);
		if (search_or_list == "list") {
			tweets = await v2Client.listTweets(list_id_or_search_query, {'tweet.fields': ['public_metrics', 'created_at']});
		}
		else if (search_or_list == "search") {
			tweets = await v2Client.search(list_id_or_search_query, {'tweet.fields': ['public_metrics', 'created_at']});
		}
		count = 0;
		count_of_timeeligible_tweets = 0;
		const tweets_to_rank = [];
		for await (const tweet of tweets) {
			count = count + 1;
			datetime_of_tweet_creation = new Date(tweet.created_at);
			if (datetime_of_tweet_creation.getTime() >= yesterday_date.getTime()) { // if the tweet is within the time period we're interested in
				count_of_timeeligible_tweets = count_of_timeeligible_tweets +1;
				tweets_to_rank.push(tweet);
			}
		}

		const tweets_to_return = []; 
		ranking_metric_array = ["like_count", "retweet_count", "reply_count", "quote_count"];
		for (let i = 0; i < ranking_metric_array.length; i++) {
			// console.log("Ranking metric is " + [ranking_metric_array[i]] + ". Returning the top " + number_of_items_to_return);
			tweets_to_rank.sort(function (a, b){return b.public_metrics[ranking_metric_array[i]] - a.public_metrics[ranking_metric_array[i]]}); // Sort by ranking metric	
			for (let iterator = 0; iterator < number_of_items_to_return; iterator++) {
				if (typeof tweets_to_rank[iterator] !== 'undefined' ) { // if this isn't empty (sometimes a quiet list will run out materialbefore hitting the number_of_items_to_return limit)
					tweets_to_return.push(tweets_to_rank[iterator]);
				}	         		
				//tweets_to_return.push(tweets_to_rank[iterator]); // OLD CODE. Previously there was not the above if statement. TODO fix bug - if you run out of items, you'll push 'undefined' instead
  	              }
		}
	
		const tweets_to_email = [];
		for (let i = 0; i < tweets_to_return.length; i++) {
			if (countNumberofOccurencesinTweetArray(tweets_to_return, tweets_to_return[i].id) > 2){ // originally 1 - which would pick up this tweet appearing by one other metric. But that became a bit congested. Let's just put the tweets included in at least 2 other metrics as the top ones.
				if (countNumberofOccurencesinArray(tweets_to_email, tweets_to_return[i].id) == 0) { // if not already in email tweet id array
					tweets_to_email.push(tweets_to_return[i].id); // add any tweet appearing in multiple quality dimensions to our final list first
				}
			}
		}
		length_of_array_remaining = number_of_items_to_return - tweets_to_email.length; // Work out remaining number of tweets, then split it in half and share this between liked and retweeted tweets.
		
		if (length_of_array_remaining <= 0) { // if triple-or-more-appearing tweets have already filled or exceeded our capacity
			console.log("Hit number_of_items_to_return without having to add liked or retweeted tweets. The completed, ready to return, email list is: " + tweets_to_email);
			return tweets_to_email;
		}

		 if (length_of_array_remaining %2 == 0) { // if the number of items remaining to be added is even
                        number_of_liked_tweets_to_add = length_of_array_remaining/2;
	                number_of_retweeted_tweets_to_add = length_of_array_remaining/2;
                } else { // if it's an odd number, go for one more liked tweet and one fewer retweeted tweet
			console.log("Uneven number of tweets remaining to add. Finessing the amounts of likes and retweets to return");
			number_of_liked_tweets_to_add = (length_of_array_remaining+1)/2;
                        number_of_retweeted_tweets_to_add = (length_of_array_remaining-1)/2;
		}

		// go through the top N from the favourites list, excluding any that have already been added
                tweets_to_rank.sort(function (a, b){return b.public_metrics.like_count - a.public_metrics.like_count}); // Sort by like_count
                for (let iterator = 0; iterator < number_of_items_to_return; iterator++) {
			if (typeof tweets_to_rank[iterator] !== 'undefined' ) {
			 	if (countNumberofOccurencesinArray(tweets_to_email, tweets_to_rank[iterator].id) == 0) { // if not already in email tweet id array
					if (number_of_liked_tweets_to_add > 0 ) { // if we have room in our 'budget' of liked tweets to add
						tweets_to_email.push(tweets_to_rank[iterator].id);
						number_of_liked_tweets_to_add --;
					}
				}
			}

                }

		 // go through the top N from the retweets list, excluding any that have already been added
                tweets_to_rank.sort(function (a, b){return b.public_metrics.retweet_count - a.public_metrics.retweet_count}); // Sort by retweet_count
                for (let iterator = 0; iterator < number_of_items_to_return; iterator++) {
			if (typeof tweets_to_rank[iterator] !== 'undefined' ) {
                       	 	if (countNumberofOccurencesinArray(tweets_to_email, tweets_to_rank[iterator].id) == 0) { // if not already in email tweet id array
                                	if (number_of_retweeted_tweets_to_add > 0 ) { // if we have room in our 'budget' of retweeted tweets to add
                                       		tweets_to_email.push(tweets_to_rank[iterator].id);
                                        	number_of_retweeted_tweets_to_add --;
                                	}
                        	}
			}
                }

                console.log("Completed getBestRecentTweets, through adding favourited/retweeted to tweets that appear in multiple top " + number_of_items_to_return + " engagement metrics. The completed, ready to return, email list is: " + tweets_to_email);
		return tweets_to_email
	}
	catch (error) {
		console.log(error.code);
		console.log(error.data);
	}
}

var findUsernameAssociatedwithTweet = async function(tweet_id){
        try {	
		const username_result_object = await v2Client.tweets(tweet_id,{ expansions: ['author_id']});
		//console.log(username_result_object.includes.users[0].username);
		return(username_result_object.includes.users[0].username);
        }
        catch (error) {
                console.log(error.code);
                console.log(error.data);
        }
}

var makeGetRequest = async function (request) {
    try {
        response = await axios.get(request);
        //console.log(response.data);
	return (response.data.html)
    } catch (err) {
       console.error(err);
    }

} 

var generateEmbedCodeforTweet = async function (tweet_id) {
	username = await findUsernameAssociatedwithTweet(tweet_id);
	base_url = "https://www.twitter.com/"
	augmented_url = base_url.concat(username, "/status/", tweet_id);
	embed_code = await makeGetRequest("https://publish.twitter.com/oembed?url=" + augmented_url + "&theme=dark");
	//console.log(embed_code);
	return(embed_code);
}

var generateSetofEmbedCodesfromListofTweets = async function (list_of_tweet_ids) {
	console.log("Time to get embed codes for this list of tweet ids: " + list_of_tweet_ids);
	embed_code_object = [];

        for await (const tweet_id of list_of_tweet_ids) {
        	embed_code_to_add = await generateEmbedCodeforTweet(tweet_id);
        	//console.log(embed_code_to_add);
		embed_code_object.push(embed_code_to_add);
        }

	console.log("Finished getting embed codes for this list of tweet ids:");
	console.log(embed_code_object);
	return(embed_code_object);
}


var generateSetofEmbedCodesforListorSearch = async function (list_or_search, list_id, number_to_return) {
	list_of_tweets_to_embed_for_this_list_or_search  = await getBestRecentTweets(list_or_search, list_id, number_to_return);
	debugger;
	object_to_return = await generateSetofEmbedCodesfromListofTweets(list_of_tweets_to_embed_for_this_list_or_search);
	return object_to_return;
}

var getListName = async function (list_id) {
        try {
                const list_name_result_object = await v2Client.list(list_id);
                return(list_name_result_object.data.name);
        }
        catch (error) {
                console.log(error.code);
                console.log(error.data);
        }
}

var iterateThroughArrayofListsorSearchesandReturnEmbedCodes = async function (list_of_lists_or_searches) {
	const object_to_return = []
	for (let i = 0; i < list_of_lists_or_searches.length; i++) {
		console.log("");
		console.log("Now looking at: " + list_of_lists_or_searches[i][1]); 
		if (list_of_lists_or_searches[i][0] == "search") {
			search_name = "<h2>" + list_of_lists_or_searches[i][1] + "</h2>";
			 object_to_return.push([search_name, await generateSetofEmbedCodesforListorSearch(list_of_lists_or_searches[i][0], list_of_lists_or_searches[i][1], list_of_lists_or_searches[i][2])]);
		} else {
			list_name = await getListName (list_of_lists_or_searches[i][1]);
			list_name = "<h2>" + list_name + "</h2>";
			 object_to_return.push([list_name, await generateSetofEmbedCodesforListorSearch(list_of_lists_or_searches[i][0], list_of_lists_or_searches[i][1], list_of_lists_or_searches[i][2])]);
		}
        }
	console.log("At the end of looping, object to return is: ");
	console.log(object_to_return);
	return object_to_return; 
}

var generateTweetSummaryObject = async function (user_sweep_preferences_object) {
	material_to_build_final_objects = await iterateThroughArrayofListsorSearchesandReturnEmbedCodes(user_sweep_preferences_object);
	tweet_summary_object = "";
	for (let i = 0; i < material_to_build_final_objects.length; i++) {
		//console.log("This list has the following to return: " +  material_to_build_final_objects[i][1]);
		//console.log("Length of this list of material is " + material_to_build_final_objects[i][1].length);
		if (material_to_build_final_objects[i][1].length > 0) { // only write this list/search to email if it has at least one item
			 tweet_summary_object = tweet_summary_object + material_to_build_final_objects[i][0]; // title
			 for (let iterator = 0; iterator < material_to_build_final_objects[i][1].length; iterator++) { // embedded tweet content
                	         tweet_summary_object = tweet_summary_object + material_to_build_final_objects[i][1][iterator];
		         }
		}
        }
	console.log(tweet_summary_object);
	return tweet_summary_object;
}

var writeSweeptoFilesystem = async function (content_to_write, username) {
	
	// If this user doesn't already have an associated folder, create it
	const folderName = "./users/" + username ;
	try {
		if (!fs.existsSync(folderName)) {
		fs.mkdirSync(folderName);
	}
	} catch (err) {
		console.error(err);
	}

	milliseconds_since_epoch = Date.now();
	filename = "./users/" + username + "/" + milliseconds_since_epoch + ".html";
	fs.writeFile(filename, content_to_write, err => {
		if (err) {
		    console.error(err);
		  }
	});
	console.log("Written to filesystem at " + filename);
	url = "http://" + process.env.SERVER_IP + ":3000/" + filename.slice(8, -5);
	console.log("URL is " + url);
	return url;
}

var finaliseSweepaheadofStorage = async function (sweep_to_finalise_for_storage, username) {
	html_to_store = "<html><head><meta charset='utf-8'><meta name='viewport' content='width=device-width, initial-scale=1'><link href='https://cdn.jsdelivr.net/npm/bootstrap@5.2.1/dist/css/bootstrap.min.css' rel='stylesheet' integrity='sha384-iYQeCzEYFbKjA/T2uDLTpkwGzCiq6soy8tYaI1GyVh/UjpbCx/TYkiZhlZB6+fzT' crossorigin='anonymous'><title>My Social Summary</title></head><body><div class='container-fluid' style='background-color: black; color:white;'><div class='container'> <h1> " + username + "'s Social Summary </h1> <p>Get more from twitter with less time and effort</p> </div><div align='center'>" + sweep_to_finalise_for_storage + "</div></div></body></html>";
	return html_to_store;
}

var finaliseEmailaheadofSend = async function (sweep_to_finalise_for_email_send, url, username) {
        html_to_email = "<html><head><meta charset='utf-8'><meta name='viewport' content='width=device-width, initial-scale=1'><link href='https://cdn.jsdelivr.net/npm/bootstrap@5.2.1/dist/css/bootstrap.min.css' rel='stylesheet' integrity='sha384-iYQeCzEYFbKjA/T2uDLTpkwGzCiq6soy8tYaI1GyVh/UjpbCx/TYkiZhlZB6+fzT' crossorigin='anonymous'><title>My Social Summary</title></head><body><div class='container-fluid'><p>Hi " + username +  ", this is your email of the best recent tweets, as judged by their level of engagement:</p><p>These tweets look much nicer in a browser, so <a href='" + url  +  "'>check out your social summary page now</a></p>" + sweep_to_finalise_for_email_send + "</div></body></html>";
        return html_to_email;
}

var sendEmail = async function (email_content_to_send, email_recipient) {

	//using Twilio SendGrid's v3 Node.js Library: https://github.com/sendgrid/sendgrid-nodejs
	const sgMail = require('@sendgrid/mail')
	sgMail.setApiKey(process.env.SENDGRID_API_KEY)
	const msg = {
	  to: email_recipient,
          from: {
		email: 'alert@mysocialsummary.com',
		name: 'My Social Summary'
	  },
	  subject: 'Your Social Summary',
	  text: 'Please switch to an HTML version of this message',
	  html: email_content_to_send,
	  }
	sgMail
	.send(msg)
	.then(() => {
	    console.log('Email sent')
	  })
	  .catch((error) => {
	    console.error(error)
	  })
}

var makeSweepthenEmailandWritetoDisk = async function (email_address, username, individual_user_sweeps_object) {
	basic_sweep_content_for_this_user = await generateTweetSummaryObject(individual_user_sweeps_object);

	version_to_store = await finaliseSweepaheadofStorage(basic_sweep_content_for_this_user, username);
	// Then prepend the fancy heading to create the HTML webpage version, and append the closing html stuff
	
	url = await writeSweeptoFilesystem(version_to_store, username);
	// Then write the webpage content to the filesystem
	
	version_to_email_to_this_user = await finaliseEmailaheadofSend(basic_sweep_content_for_this_user, url, username);
	// prepend the "you should look at this online" prompt to create the email version, and append closing html stuff

	// Then send the email
	sendEmail(version_to_email_to_this_user, email_address);
}

var runEverything = async function () {
	parsed_csv_input = openandParseCSV();
	//console.log("parsed csv input is:");
	//console.log(parsed_csv_input);

	list_of_user_accounts_and_preference_items = turnParsedCSVintoList(parsed_csv_input);
	console.log("list_of_user_accounts_and_preference_items is: ");
	console.log(list_of_user_accounts_and_preference_items);

	console.log("\n\nTime to iterate through " + list_of_user_accounts_and_preference_items.length + " different users and their sweep lists\n\n");

	for (individual_user_and_sweeps_to_carry_out of list_of_user_accounts_and_preference_items) { //iterate through each user
	        email_address = individual_user_and_sweeps_to_carry_out[0];
	        username = individual_user_and_sweeps_to_carry_out[1];
        	individual_user_sweeps_object = individual_user_and_sweeps_to_carry_out[2];
		console.log("\nTime for the next user:");
	        console.log(email_address);
        	console.log(username);
	        console.log(individual_user_sweeps_object);
        	await makeSweepthenEmailandWritetoDisk(email_address, username, individual_user_sweeps_object)
	}
}

runEverything();
