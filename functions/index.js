const {google} = require('googleapis');
const functions = require('firebase-functions');
const credentials = require('./credentials.json');
const admin = require('firebase-admin');

const calendar = google.calendar('v3');
const SCOPES = ["https://www.googleapis.com/auth/calendar.readonly"];

admin.initializeApp();

exports.setAlarmTime = functions.https.onRequest((request, response) => {
  const jwtClient = new google.auth.JWT(
    credentials.client_email,
    null,
    credentials.private_key,
    SCOPES
  );

  jwtClient.authorize((err, tokens) => {
    if (err) {
      console.error(err);
    } else {
      console.log("Successfully connected!");
    }
  });

  setAllAlarms(jwtClient, () => response.status(200).send('Successfully executed!'));
});

function setAllAlarms(jwtClient, sendStatus) {
  return admin.database().ref().once('value').then(snapshot => {
    let data = snapshot.val();
    let counter = 0;

    function report() {
      counter++;
      if (counter === Object.keys(data).length) {
        sendStatus();
      }
    }

    for (let i in data) {
      if (data.hasOwnProperty(i)) {
        let additionalData = {
          minTime: data[i].minTime,
          maxTime: data[i].maxTime,
          timeZone: data[i].timeOffset,
          offset: data[i].alarmOffset
        };
        console.log('additionalData', additionalData);
        findEarliestEvent(jwtClient, data[i].calendars, i, report, additionalData);
      }
    }
    return null;
  });
}

function findEarliestEvent(auth, calendars, userId, outerReport, additionalData) {
  let timeMin = getDateObj(additionalData.minTime, additionalData.timeZone);
  let timeMax = getDateObj(additionalData.maxTime, additionalData.timeZone);
  let counter = 0;
  let earliest = {start: {dateTime: getDateObj(additionalData.maxTime, additionalData.timeZone)}};

  function report(currentEarliest) {
    counter++;
    if (counter === calendars.length) {
      pushAlarmTime(userId, computeAlarmTime(currentEarliest, additionalData.offset), outerReport)
    }
  }

  for (let i in calendars) {
    if (calendars.hasOwnProperty(i)) {
      getEarliestEvent(auth, calendars[i], timeMin, timeMax, report, earliest);
    }
  }
}

function getDateObj(hour, timeZone) {
  let tomorrow = new Date();
  let day = 1;
  if (tomorrow.getHours() < timeZone)
    day = 0;
  tomorrow.setHours(hour + timeZone);
  tomorrow.setDate(tomorrow.getDate() + day);
  tomorrow.setMinutes(0);
  tomorrow.setSeconds(0);
  return tomorrow.toISOString();
}

function getEarliestEvent(auth, calendar, timeMin, timeMax, report, earliest) {
  if (calendar.include) {
    readCalendar(auth, calendar.id, timeMin, timeMax)
      .then(data => earliestEventFromCalendar(data, earliest, report))
      .catch(err => console.error(err.message));
  } else {
    report(earliest);
  }
}

function readCalendar(auth, calId, timeMin, timeMax) {
  return new Promise((resolve, reject) => {
    calendar.events.list({
      auth: auth,
      calendarId: calId,
      timeMin: timeMin,
      timeMax: timeMax,
      showDeleted: false,
      singleEvents: true,
      maxResults: 10,
      orderBy: 'startTime'
    }, (err, res) => {
      if (err) {
        console.log('Rejecting because of error');
        reject(err);
      }
      console.log('Request successful');
      resolve(res.data);
    });
  });
}

function earliestEventFromCalendar(data, earliest, report) {
  let events = data.items;

  for (let i = 0; i < events.length; i++) {
    let event = events[i];
    let when = event.start.dateTime;
    if (when) {
      if ((new Date(when)) < (new Date(earliest.start.dateTime))) earliest = event;
      else report(earliest);
      break;
    }
  }
  report(earliest);
  return null;
}

function computeAlarmTime(event, offset) {
  let time = new Date(event.start.dateTime);
  time.setMinutes(time.getMinutes() - offset);
  return time.toISOString();
}

function pushAlarmTime(userId, time, report) {
  console.log('Setting alarm time to ' + time + ' UTC');
  return admin.database().ref(userId).update({alarmTime: time}).then(() => {
    report();
    return null;
  });
}