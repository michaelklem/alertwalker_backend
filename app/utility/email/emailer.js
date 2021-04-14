const Aws 		= require('aws-sdk');
const Environment    = require('../../environment');
const {Log} 		= require('../../model');

// TODO: Create singleton

/**
	Verify a new email address to send from
	@param 	{String}	emailAddress 	Email address to verify
	@returns	{Boolean}	true if verification email sent or false if error
*/
async function verifyEmailAddress(emailAddress)
{
	const sesConfig =
	{
		accessKeyId: Environment.AWS_ACCESS_KEY_ID,
		apiVersion: '2010-12-01',
		region: Environment.AWS_SES_REGION,
		secretAccessKey: Environment.AWS_SECRET_ACCESS_KEY
	};

	try
	{
		const params =
		{
			EmailAddress: emailAddress
		};
		const result = await new Aws.SES(sesConfig).verifyEmailIdentity(params).promise();

		// Error
		if(result === undefined)
		{
			await Log.Error(__filename, err);
			throw err;
		}
		return true;
	}
	catch(err)
	{
		console.log("Emailer.listIdentities error " + err.message + "\n" + err.stack);
		await Log.Error(__filename, err);
		throw err;
	}
}

async function listIdentities()
{
	const sesConfig =
	{
		accessKeyId: Environment.AWS_ACCESS_KEY_ID,
		apiVersion: '2010-12-01',
		region: Environment.AWS_SES_REGION,
		secretAccessKey: Environment.AWS_SECRET_ACCESS_KEY
	};

	try
	{
		const result = await new Aws.SES(sesConfig).listIdentities().promise();

		// Error
		if(result === undefined)
		{
			await Log.Error(__filename, err);
			throw err;
		}

		// Success
		return result.Identities;
	}
	catch(err)
	{
		console.log("Emailer.listIdentities error " + err.message + "\n" + err.stack);
		await Log.Error(__filename, err);
		throw err;
	}
}

/**
	Validates if we can send from this email address or not
	@param 	{String}	emailAddress	Email address we want to send from
	@returns	{Bool}	true if we can false if we can't
*/
async function isValidSendFromAddress(emailAddress)
{
	const identities = await listIdentities();
	for(var i = 0; i < identities.length; i++)
	{
		// Validating a domain
		if(identities[i].indexOf('@') === -1)
		{
			if(emailAddress.substr(emailAddress.indexOf('@') + 1).toLowerCase() === identities[i].toLowerCase())
			{
				return true;
			}
		}
		// Validating a specific email address
		else
		{
			if(identities[i].toLowerCase() === emailAddress.toLowerCase())
			{
				return true;
			}
		}
	}
	return false;
}


/**
  Send email via Amazon SES API
 	@param 	{Object} 	params {to, subject, body, htmlBody}
 	@return  {Promise} 	Resolve on success|reject on error
 */
async function sendEmail(params)
{
	const sesConfig =
	{
		accessKeyId: Environment.AWS_ACCESS_KEY_ID,
		apiVersion: '2010-12-01',
		region: Environment.AWS_SES_REGION,
		secretAccessKey: Environment.AWS_SECRET_ACCESS_KEY
	};


	// Create sendEmail params
	const sesParams =
	{
		Destination:
		{
			CcAddresses: [],
			ToAddresses: [params.to]
		},
		Message:
		{
			Body:
			{
				Html:
				{
					Charset: "UTF-8",
					Data: params.htmlBody ? params.htmlBody : params.body
				},
				Text:
				{
					Charset: "UTF-8",
					Data: params.body
				}
			},
			Subject:
			{
				Charset: 'UTF-8',
				Data: params.subject
			}
		},
		ReplyToAddresses: [],
		Source: Environment.EMAIL_FROM_EMAIL
	};

  try
	{
		const result = await new Aws.SES(sesConfig).sendEmail(sesParams).promise();

		// Error
		if(result === undefined)
		{
			await Log.Error(__filename, err);
			throw err;
		}

		//Log.Info(__filename, 'Email sent to ' + params.to);

		// Success
		return result;
	}
	catch(err)
	{
		console.log("Emailer.sendEmail error " + err.message + "\n" + err.stack);
		await Log.Error(__filename, err);
		throw err;
	}
}

/**
  Send email via Amazon SES API
 	@param 	{Object} 	params {to, subject, body, htmlBody}
 	@return  {Promise} 	Resolve on success|reject on error
 */
async function sendTemplatedEmail({ templateData, toEmail, templateName })
{
	const sesConfig =
	{
		accessKeyId: Environment.AWS_ACCESS_KEY_ID,
		apiVersion: '2010-12-01',
		region: Environment.AWS_SES_REGION,
		secretAccessKey: Environment.AWS_SECRET_ACCESS_KEY
	};


	// Create sendEmail params
	const sesParams =
	{
		Destination:
			{ /* required */
		    	CcAddresses: [],
		    	ToAddresses: [toEmail]
			},
			Template: templateName,
			TemplateData: JSON.stringify(templateData),
			Source: Environment.EMAIL_FROM_EMAIL,
			ReplyToAddresses: []
	};

  try
	{
		const result = await new Aws.SES(sesConfig).sendTemplatedEmail(sesParams).promise();
		// Success
		return result;
	}
	catch(err)
	{
		console.log("Emailer.sendEmail error " + err.message + "\n" + err.stack);
		await Log.Error(__filename, err);
		throw err;
	}
}


module.exports =
{
	isValidSendFromAddress,
	sendEmail,
	sendTemplatedEmail,
	listIdentities,
	verifyEmailAddress
};
