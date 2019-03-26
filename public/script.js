// Client ID and API key from the Developer Console
const CLIENT_ID = '746708551342-jdu8dgcvimu3comoretsi908i8i0apae.apps.googleusercontent.com';
const API_KEY = 'AIzaSyDQLdqstsyQPuWDjRc3WfXYm-Wn-Bq0lRc';
const SERVER_ACCOUNT = 'automatic-alarm--1550249754736@appspot.gserviceaccount.com';

// Array of API discovery doc URLs for APIs used by the quickstart
const DISCOVERY_DOCS = ["https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest"];

// Authorization scopes required by the API; multiple scopes can be included, separated by spaces.
const SCOPES = "https://www.googleapis.com/auth/calendar";

let authorizeButton = document.getElementById('authorize_button');
let signoutButton = document.getElementById('signout_button');
let calendars = [];

let userId = null;

/**
 *  On load, called to load the auth2 library and API client library.
 */
function handleClientLoad() {
  gapi.load('client:auth2', initClient);
}

function configDatabase() {
  // Initialize Firebase
  let config = {
    apiKey: "AIzaSyCWZSzv2KLWe2UsPMs7XjAwpkQgvvujE2Y",
    authDomain: "automatic-alarm-1550249754736.firebaseapp.com",
    databaseURL: "https://automatic-alarm-1550249754736.firebaseio.com",
    storageBucket: "automatic-alarm--1550249754736.appspot.com",
  };
  firebase.initializeApp(config);
}

function writeCalData() {
  firebase.database().ref(userId + '/calendars').set(calendars);
}

/**
 *  Initializes the API client library and sets up sign-in state
 *  listeners.
 */
function initClient() {
  configDatabase();
  gapi.client.init({
    apiKey: API_KEY,
    clientId: CLIENT_ID,
    discoveryDocs: DISCOVERY_DOCS,
    scope: SCOPES
  }).then(function () {
    // Listen for sign-in state changes.
    gapi.auth2.getAuthInstance().isSignedIn.listen(updateSigninStatus);

    // Handle the initial sign-in state.
    updateSigninStatus(gapi.auth2.getAuthInstance().isSignedIn.get(), gapi.auth2.getAuthInstance().currentUser.get());
  }, function(error) {
    $('#content').html = JSON.stringify(error, null, 2);
  });
}

/**
 *  Called when the signed in status changes, to update the UI
 *  appropriately. After a sign-in, the API is called.
 */
function updateSigninStatus(isSignedIn, user) {
  if (isSignedIn) {
    authorizeButton.style.display = 'none';
    signoutButton.style.display = 'block';
    if (user !== undefined) {
      userId = user.getBasicProfile().getId();
      document.getElementById('body').style.display = 'block';
      renderSettings();
      getCalendars();
    } else {
      setTimeout(function () {
        updateSigninStatus(isSignedIn, gapi.auth2.getAuthInstance().currentUser.get())
      }, 100);
    }
  } else {
    authorizeButton.style.display = 'block';
    signoutButton.style.display = 'none';
    userId = null;
  }
}

/**
 *  Sign in the user upon button click.
 */
function handleAuthClick(event) {
  gapi.auth2.getAuthInstance().signIn();
}

/**
 *  Sign out the user upon button click.
 */
function handleSignoutClick(event) {
  gapi.auth2.getAuthInstance().signOut();
  resetPage();
}

function resetPage() {
  $('#calendars').html('');
  $('#header').html('');
  $('#content').html('');
}

function getCalendars() {
  return gapi.client.calendar.calendarList.list({
    "showDeleted": false,
    "showHidden": false,
    "minAccessRole": "owner",
  })
    .then(function(response) {
      readCalData(response.result.items);
    }, function(err) {
      console.error("Execute error", err);
    });
}

function readCalData(rawCals) {
  return firebase.database().ref(userId + '/calendars').once('value')
    .then(function(snapshot) {
      let dataCalendars = snapshot.val();
      let calendar;
      let formHTML = '';
      let include = false;

      for (let i in rawCals) {
        if (rawCals.hasOwnProperty(i)) {
          calendar = rawCals[i];
          if (dataCalendars !== null) {
            for (let j in dataCalendars) {
              if (dataCalendars.hasOwnProperty(j) && calendar.id === dataCalendars[j].id && dataCalendars[j].include !== undefined) {
                include = dataCalendars[j].include;
                break;
              }
            }
          }
          formHTML += inputString(calendar, include);
          calendars.push({id: calendar.id, name: calendar.summary, include: include});
          shareCalendar(calendar.id, (include ? 'reader' : 'none'));
        }
        include = false
      }
      $('#calendars').html(formHTML + '<button type="button" onclick="submitCalendarForm()">Submit</button>');
      writeCalData();
    });
}

function shareCalendar(calId, scope) {
  return gapi.client.calendar.acl.insert({
    "calendarId": calId,
    "sendNotifications": false,
    "resource": {
      "role": scope,
      "scope": {
        "type": "user",
        "value": SERVER_ACCOUNT
      }
    }
  }).then(function(response) {
      // Handle the results here (response.result has the parsed body).
      console.log("Response", response);
    },
    function(err) { console.error("Execute error", err); });
}

function inputString(calendar, checked) {
  let checkedString = (checked ? 'checked' : '');
  return `<input type="checkbox" id="${calendar.id}" value="${calendar.summary}" ${checkedString}>${calendar.summary}<br></input>`;
}

function submitCalendarForm() {
  let checkboxes = $('#calendars').find('input');
  let checkbox;
  for (let i = 0; i < checkboxes.length; i++) {
    checkbox = checkboxes[i];
    if (checkbox.value !== undefined) calendars[i].include = checkbox.checked;
  }
  writeCalData();
}

function renderSettings() {
  firebase.database().ref(userId).on('value', function(snapshot) {
    $('#time_offset').val(snapshot.val().timeOffset);
    $('#min_time').val(snapshot.val().minTime);
    $('#max_time').val(snapshot.val().maxTime);
    $('#alarm_offset').val(snapshot.val().alarmOffset);
  });
}

function submitSettings() {
  let timeOffset = $('#time_offset').val();
  let minTime = $('#min_time').val();
  let maxTime = $('#max_time').val();
  let alarmOffset = $('#alarm_offset').val();

  let dataObj = {
    timeOffset: parseInt(timeOffset),
    minTime: parseInt(minTime),
    maxTime: parseInt(maxTime),
    alarmOffset: parseInt(alarmOffset)
  };

  console.log(dataObj);
  console.log(userId);

  for (let i in dataObj) {
    if (dataObj.hasOwnProperty(i) && isNaN(dataObj[i])) {
      renderSettings();
      return;
    }
  }

  firebase.database().ref(userId).update(dataObj);
}