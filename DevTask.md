# Introduction

You've joined a team that maintains an Event Management System. The system talks to external APIs and helps to view and add the events.
The application is built with Node.js and Fastify.

The system is experiencing few issues in production:
- Slow response times, especially when there are more number of events
- Poor resilience when external services are unavailable


# Onboarding

## Tech Stack
- Node.js
- Fastify
- MSW (library to mock external endpoints)

```bash
npm i
npm start
```

## API Endpoints
URL - http://localhost:3000

The application exposes below endpoints:

- `GET /getUsers` - Returns list of users
- `GET /getEvents` - Returns list of Events
- `GET /getEventsByUserId/:id` - Returns events planned for a user id
- `POST /addEvent` - Helps to add/schedule a new event
- payload for POST
 
 ```bash
 curl --location --request POST 'http://localhost:3000/addEvent' \
--header 'Content-Type: application/json' \
--data-raw '{
    "name": "hello",
    "userId": "3"
}'
```

# Tasks

Below are the tasks to work on inside of this repo. Please spend no more than 2 hours in total. 

## Task 1 - configure and document the repository

The project is missing a number of things that would be expected in a production-ready project. You should add these things and document them in the `README.md`, which is currently empty.

You are free to configure the project however you like. What is important is that you document the choices you make and why you made them.

If you run out of time to perform the actual configuration, please document what you would have done. 

## Task 2 - Improve Performance

1. `/getEventsByUserId` endpoint is responding very slow as the number of events increases. Your task is to review the code, identify and apply any fixes to make that API faster.

How to test: You can add more events to an user by using `/addEvent` endpoint and then use `/getEventByUserId` to observe slowness.<br>
Note: One of the dependent external API is mocked to delay the response. It is an intentional delay, please don't remove that.

## Task 3 - Improve Resilience

1. `/addEvent` is dependent on external API `http://event.com/addEvent`, which can handle only certain number of requests, if load increases it fails.
2. The external service is simulated using MSW (Mock Service Worker), which has been configured to fail after a certain number of requests
3. Your implementation should:
   - Detect when the external service is consistently failing (3+ failures within a 30-second window)
   - Implement a backoff/retry mechanism that reduces the load on the external service during failure periods
   - Gradually test if the service has recovered and resume normal operations when it's available again
   - Provide appropriate error responses to clients when the external service is unavailable

4. The solution should be implemented without using third-party libraries specifically designed for this pattern (implement your own solution).

Good luck!
