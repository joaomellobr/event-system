const { http, HttpResponse, delay } = require('msw');
const { setupServer } = require('msw/node');
const user = require('./mocks/user.json');
 
let requestCount = 0
const userStore = {
  users:{
    "1" : {
      userName: 'user1',
      id: 1,
      email: 'hello@gmail.com',
      events: ['event-1', 'event-3']
    },
    "2" : {
      userName: 'user2',
      id: 2,
      email: 'hello2@gmail.com',
      events: ['event-2']
    },
    "3" : {
      userName: 'user3',
      id: 2,
      email: 'hello3@gmail.com',
      events: ['event-4']
    }
  },
  addUser(user) {
    this.users[user.id] = user;
    return user;
  },
  getUser(id) {
    return this.users[id];
  },
  getUsers() {
    return Object.values(this.users);
  },
  addEventTouUser(userId, eventId) {
    this.users[userId].events.push(eventId);
  }
}

const eventStore = {
  events: {
    "event-1": {
      id: 1,
      name: 'Event 1',
      userId: 1,
      details: 'This is the first event'
    },
    "event-2": {
      id: 1,
      name: 'Event 2',
      userId: 2,
      details: 'This is the first event'
    },
    "event-3": {
      id: 1,
      name: 'Event 1',
      userId: 1,
      details: 'This is the first event'
    },
    "event-4": {
      id: 1,
      name: 'Event 4',
      userId: 3,
      details: 'This is the first event'
    }
  },
  addEvent(event) {
    this.events[event.id] = event;
    return event;
  },
  getEvent(id) {
    return this.events[id];
  },
  getEvents() {
    return Object.values(this.events);
  }
};


// Provide the server-side API with the request handlers.
const server = setupServer(
  http.get('http://event.com/getUsers', () => {
    if (Math.random() < 0.05) {
      return HttpResponse.error(new Error('Server error occurred'));
    } 
    return HttpResponse.json(userStore.getUsers());
  }),

  http.get('http://event.com/getUserById/:id', ({params}) => {
    return HttpResponse.json(userStore.getUser(params.id))
  }),
  
  http.post('http://event.com/addEvent', async ({request}) => {
    requestCount++
    // Simulate a successful response for the first 5 requests
    if (requestCount <= 5 || requestCount == 0) {
      const requestBody = await request.json()
      eventStore.addEvent(requestBody);
      userStore.addEventTouUser(requestBody.userId, requestBody.id)
      return HttpResponse.json({
        success: true
      });
    } 
    // Then fail for the next 10 requests
    else {
      if (requestCount >= 15) {
        requestCount = 0;
      }
      await delay(100)
      return HttpResponse.json({
        success: false,
        error: 'Service temporarily unavailable',
        message: 'Event API is experiencing high load'
      },{
        status: 503,
      })
    }
  }),
  http.get('http://event.com/getEvents', () => {
    if (Math.random() < 0.05) {
      return HttpResponse.error(new Error('Server error occurred'));
    } 
    return HttpResponse.json(eventStore.getEvents())
  }),
  http.get('http://event.com/getEventById/:id', async ({params}) => {
    await delay(500);
    return HttpResponse.json(eventStore.getEvent(params.id))
  }),
)

const listenMock = () => {
  // Start the interception.
  server.listen()
}

module.exports = listenMock;