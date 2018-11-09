// See https://github.com/dialogflow/dialogflow-fulfillment-nodejs
// for Dialogflow fulfillment library docs, samples, and to report issues
'use strict';

const functions = require('firebase-functions');
const {WebhookClient} = require('dialogflow-fulfillment');
const {Card, Suggestion, Payload} = require('dialogflow-fulfillment');
const { RichResponse,
  PLATFORMS,
  SUPPORTED_PLATFORMS,
  SUPPORTED_RICH_MESSAGE_PLATFORMS} = require('dialogflow-fulfillment');
const zomato = require('zomato');
const admin = require('firebase-admin');
admin.initializeApp();

var client = zomato.createClient({
    userKey: '9e328ddec3e2a1ee88d202c7e77569e8', //as obtained from [Zomato API](https://developers.zomato.com/apis)
});

process.env.DEBUG = 'dialogflow:debug'; // enables lib debugging statements
 
exports.dialogflowFirebaseFulfillment = functions.https.onRequest((request, response) => {
  const agent = new WebhookClient({ request, response });
  console.log('Dialogflow Request headers: ' + JSON.stringify(request.headers));
  console.log('Dialogflow Request body: ' + JSON.stringify(request.body));
  
  //Welcome intent webhook call process
  function welcome(agent) {
    agent.add(`Welcome to my agent!`);
  }
  
  //fallback intent webhook call process to get location or process any other data.
  function fallback(agent) {
    if(request.body.originalDetectIntentRequest.payload.data.postback.data.lat && request.body.originalDetectIntentRequest.payload.data.postback.data.long){
        let lati = request.body.originalDetectIntentRequest.payload.data.postback.data.lat;
        let long = request.body.originalDetectIntentRequest.payload.data.postback.data.long;
        console.log("***Lat***" + lati);
        console.log("***Long***" + long);
        
        const context = agent.getContext('generic');
        const allContexts = agent.contexts; // [{ name: 'languages-followup', ...}]
        console.log("Context-generic: " + context);
        console.log("all-context: " + allContexts);
        
        const cuisine = context.parameters.cuisine;
        console.log("cuisine: " + cuisine);
        const givenName = context.parameters['given-name'];
        console.log("given-name: " + givenName);
        //agent.add(`I can't believe you've know ${language} for ${duration}!`);
        //agent.add(`Thanks, we have located you.`);
        agent.add(new Card({
         title: `Please Confirm:`,
         text: `Your name is ${givenName} and preferred cuisine is ${cuisine}`,
         buttonText: 'Confirm',
         buttonUrl: 'Confirm'
        })
        );
        
        agent.setContext({
            "name": 'generic',
            "lifespan": 5,
            "parameters":{"lat": lati,
                "long": long
            }
        });
        
        
        
       
        
    }else{
        agent.add(`I didn't understand`);
        agent.add(`I'm sorry, can you try again?`);
    }
}

    //insert to database, save user data.
    function insertToFirebase(agent) {
        
        const context = agent.getContext('generic');
        const allContexts = agent.contexts; // [{ name: 'languages-followup', ...}]
        console.log("Context-generic: " + context);
        console.log("all-context: " + allContexts);
        
        const cuisine = context.parameters.cuisine;
        console.log("cuisine: " + cuisine);
        const givenName = context.parameters['given-name'];
        const lat = context.parameters.lat;
        const long = context.parameters.long;
        console.log("given-name: " + givenName);
        console.log("insert into firebase");
        return admin.database().ref('/userdetails').push({name: givenName, cuisine: cuisine, lat: lat, long: long}).then((snapshot) => {
           //agent.add(`Thanks! I have saved your details.`);
           agent.add(new Card({
                title: `Thanks`,
                text: `Click below to get top 5 ${cuisine} restaurants near you!`,
                buttonText: 'Get',
                buttonUrl: 'Get'
            })
            );
            
           //getRestaurants(agent, lat, long);
           console.log('database write successful: ' + snapshot.ref.toString());
            return; 
        });
    }
    
    //get restaurants cuisine and details from zomato api's
    function getRestaurants(agent){
        const context = agent.getContext('generic');
        const allContexts = agent.contexts; // [{ name: 'languages-followup', ...}]
        console.log("Context-generic: " + context);
        console.log("all-context: " + allContexts);
        const cuisine = context.parameters.cuisine;
        console.log("cuisine: " + cuisine);
        const givenName = context.parameters['given-name'];
        const lati = context.parameters.lat;
        const long = context.parameters.long;
        
        return new Promise((resolve, reject) => {
            client.getCuisines({
                lat:lati, //latitude
                lon:long //longitude
            },function(error, result){
                if(result){
                    var ava_cuisines = JSON.parse(result);
                    console.log(ava_cuisines.cuisines);
                    console.log("array length=");
                    console.log(ava_cuisines.cuisines.length);
                    var id;
                    for (var i=0; i < ava_cuisines.cuisines.length; i++){
                        console.log(ava_cuisines.cuisines[i].cuisine.cuisine_name);
                        if ((ava_cuisines.cuisines[i].cuisine.cuisine_name).toLowerCase() == cuisine.toLowerCase()){
                            id = ava_cuisines.cuisines[i].cuisine.cuisine_id;
                            console.log("cuisine_id = " + id);
                            return client.search({
                                lat:lati, //latitude
                                lon:long, //longitude
                                radius: "1000",
                                cuisines: id,
                                sort: "rating",
                                count: "5",
                                order: "desc"
                            },function(error, restaurants){
                            if(restaurants){
                                console.log("restaurants: " + restaurants);
                                var restaurantsDict = JSON.parse(restaurants);
                                var restaurantArray = [];
                                agent.add("Below are the top 5 with ratings:");
                                for (var i=0; i<5; i++){
                                    var name = restaurantsDict.restaurants[i].restaurant.name;
                                    var rating = restaurantsDict.restaurants[i].restaurant.user_rating.aggregate_rating;
                                    restaurantArray[i] = name + " => " + rating;
                                    
                                }
                                agent.add(restaurantArray[0]);
                                agent.add(restaurantArray[1]);
                                agent.add(restaurantArray[2]);
                                agent.add(restaurantArray[3]);
                                agent.add(restaurantArray[4]);
                                //return;
                                resolve();
                                
                            }
                            else{
                                console.log(error);
                            }
                        });
                            agent.add(cuisine + " found");
                            console.log(cuisine + " found");
                            break;
                        }
                    }
                    if (!id){
                        console.log("No such cuisine found!, Please try again.")
                        agent.add("No such cuisine found!, Please try again.");
                        resolve();    
                    }
                    
                }else{
                    reject();
                }
            });
        });
    }
    
    function setName(agent){
        var username = request.body.queryResult.queryText;
        console.log("******NAme: " + username);
        agent.setContext({
            "name": 'generic',
            "lifespan": 5,
            "parameters":{
                "given-name": username
            }
        });
        agent.add('Hi ' + username + ' , please provide us your location.');
        
        
        agent.add(new Payload("FACEBOOK",{
            "text": username + ",please share your location:",
            "quick_replies": [
            {
                "content_type": "location"
            }
            ]
          }));
          
    }
        
  // Run the proper function handler based on the matched Dialogflow intent name
  let intentMap = new Map();
  intentMap.set('Default Welcome Intent', welcome);
  //intentMap.set('Default Fallback Intent', fallback);
  intentMap.set('askfirstName - fallback - fallback', fallback);
  //intentMap.set('Default Fallback Intent - yes', insertToFirebase);
  intentMap.set('askfirstName - fallback - fallback - yes', insertToFirebase);
  
  //intentMap.set('Default Fallback Intent - yes - custom', getRestaurants);
  intentMap.set('askfirstName - fallback - fallback - yes - custom', getRestaurants);
  intentMap.set('askfirstName - fallback', setName);
  
  agent.handleRequest(intentMap);

});

