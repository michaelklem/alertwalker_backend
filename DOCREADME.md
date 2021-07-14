Structure
====
- Modules are controllers for specific routes.
  - Each controller has routes related to the functionality the controller provides.
  - Module: "oauth" with route "login" would be called like so:
  ```json
  apiURL/oauth/login
  ```

Collections
====
- authorizations
  - The authorization types a user can have assigned to them.
  - A user can only have one authorization type.
  - This is useful if you have different roles in your application but Alert Walker has only one role "customer".

- components
  - Not currently used in the app.

- configurations
  - Editable configuration options that will change how the app functions.
  - For example the S3 bucket where files are uploaded to.
  - The AWS Pinpoint app ID for triggering push notifications.

- eventsubscriptions
  - This is how the app knows for what events to trigger a notification for.
  - This uses the collection "subscribableevents".
  - When a user signs up they will get a 1 record created in this collection for each record that exists in "subscribableevents".
  - When an API call is made to the /data route is will either be creating, querying, updating, or deleting (the action).
    - If there is a subscribableevent for this action it will lookup all event eventsubscriptions for that event and trigger the proper notification.

- fields
  - Not currently used in the app.

- files
  - This is where any files that are uploaded are stored.

- geofenceareas
  - Any alerts created by users are stored in this collection.

- logs
  - The system will log various events or errors that occur using the app/model/log class.
  - For example when a password is reset it is logged here that the event occurred for auditing purposes.

- models
  - All of the collections are stored in the database as "models".
  - Models have schema fields which define the individual fields for that collection/model.
  - Internally used by the backend, I don't recommend playing around with this collection.

- notifications
  - This is a notification sent from the application.
  - It contains the data of the notification for example the title and body.

- oauthtokens
  - This is a third party OAuth token from Google.
  - It is returned after a user signs in with Google.

- pages
  - Some pages in the app such as the home screen and authentication screens utilize this collection.
  - This allows for dynamically adding fields to screens such as the registration screen.

- pushnotifications
  - This is the log of the push notification that was sent.
  - It will contain the parameters passed into the API that sends the push token for easier debugging.

- pushtokens
  - This is a token from Google or Apple that allows us to send a push notification to a user's specific device.

- schemafields
  - These are the fields that a model contains.
  - Internally used by the backend, I don't recommend playing around with this collection.

- subscribableevents
  - An event that a user can be subscribed to so that they receive notifications for specific events in the app.

- thirdpartyaccounts
  - A third party account such as Google.
  - This is how we know what user is associated with what third party account.

- tokens
  - This is the Javascript Web Token that the mobile app uses for communicating with the backend.

- users
  - Users of the application.

- verifications
  - When a user initiates a password reset a verification request is created here.
