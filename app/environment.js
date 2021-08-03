module.exports =
{
	AWS_S3_REGION: 					process.env.AWS_S3_REGION,
	AWS_ACCESS_KEY_ID:  		process.env.AWS_ACCESS_KEY_ID,
	AWS_PIN_POINT_REGION: 	process.env.AWS_PIN_POINT_REGION,
	AWS_SES_REGION:					process.env.AWS_SES_REGION,
	AWS_SECRET_ACCESS_KEY:	process.env.AWS_SECRET_ACCESS_KEY,

	EMAIL_FROM_EMAIL:    		process.env.EMAIL_FROM_EMAIL,

	ERROR_MESSAGE: 'An unexpected error has occurred. Please try again. If the issue persists please contact support.',

	FIREBASE_SERVER_KEY: 		process.env.FIREBASE_SERVER_KEY,
	FRONTEND_TITLE: 				process.env.FRONTEND_TITLE,

	GOOGLE_CREDENTIALS: 	process.env.GOOGLE_CREDENTIALS,

	JWT_TOKEN_EXPIRE_SEC:	process.env.JWT_TOKEN_EXPIRE_SEC,
	JWT_TOKEN_KEY:				process.env.JWT_TOKEN_KEY,

	LIVE: process.env.LIVE,

	MICROSOFT_CREDENTIALS: process.env.MICROSOFT_CREDENTIALS,

	MONGODB_URI: 					process.env.MONGODB_URI,

	PORT:									process.env.PORT,

	VAPID_PUBLIC_KEY: process.env.VAPID_PUBLIC_KEY,
	VAPID_PRIVATE_KEY: process.env.VAPID_PRIVATE_KEY,

	EMAIL_ADDRESS: process.env.EMAIL_ADDRESS,
	EMAIL_PASSWORD: process.env.EMAIL_PASSWORD
};
