const BodyParser    = require('body-parser');
const Ext           = require('../extension');
const { Log }           = require('../model');
const { ModelManager, NotificationManager }  = require('../manager');
const Multiparty    = require('multiparty');
const Router        = require('express').Router();
const {Emailer} = require('../utility')

// For handling JSON
Router.use(BodyParser.urlencoded({ extended: true, limit: '50mb' }));
Router.use(BodyParser.json({ limit: '50mb' }));

/**
	API routes providing data related tools such as retrieval, updating, and removing.
  @module data/
 */


/**
	@name Create
	@route {POST}	/create
	@description Create a new Model document
	@authentication Requires a valid x-access-token
	@headerparam 	{JWT} 	x-access-token		Token to decrypt
	@headerparam	{String}	x-request-source 	(web|mobile)
	@headerparam 	{GUID}	x-device-id 	Unique ID of device calling API
	@headerparam 	{String}	x-device-service-name 	(ios|android|chrome|safari)
	@bodyparam 	{String}	model 	  Model record belongs to
	@bodyparam 	{JSON}		params 		Params we can pass directly to Mongo that map to Core Model schema for model
  @return {Mongo.document}  Newly created document
*/
Router.post('/create', async (req, res) =>
{
	console.log('[data controller] create');
	try
	{
		const form = new Multiparty.Form();
		form.maxFieldsSize = 20*1024*1024; // 20 MB
		form.maxFilesSize= 20*1024*1024; // 20 MB
		form.parse(req, async (formErr, fields, files) =>
		{
			if(formErr)
			{
				console.log(formErr);
				return res.status(200).send({ error: formErr });
			}
			// Required on every call
			if(!fields)
			{
				return res.status(200).send({ error: 'Missing ID parameter' });
			}
			if(!fields.model)
			{
				return res.status(200).send({ error: 'Missing model parameter' });
			}

			try
			{
				// Validate user
				const decodedTokenResult = await Ext.validateToken(req.headers['x-access-token']);
				if(decodedTokenResult.error !== null)
				{
					return res.status(200).send({ error: decodedTokenResult.error });
				}

				console.log('[data controller] create form fields: ' + JSON.stringify(fields))

				// Locate model
				const modelMgr = ModelManager.GetInstance();
				const mModel = modelMgr.getModel(fields.model[0]);
				if(mModel === undefined)
				{
					return res.status(200).send({ error: 'Error: d5\nCould not find any model with name {' + fields.model[0] + '}' });
				}

				// Validate create permissions
				const canCreate = await mModel.canPerformAction('create', decodedTokenResult.user);
				if(!canCreate)
				{
					console.log('[data controller] create token: ' + decodedTokenResult.user._id.toString() + ' tried to create ' + fields.model[0]);
					return res.status(200).send({ error: 'You are not authorized to create this model type' });
				}

				// Build create params
				const coreModelDoc = await mModel.getCoreDocument();
				const createParams = await modelMgr.convertFormFieldsToJsonParams(coreModelDoc.schemaFields, fields, files, decodedTokenResult.user._id);
				console.log('[data controller] create createParams: ' + JSON.stringify(createParams));
				const createdRecord = await mModel.create(createParams, decodedTokenResult.user);

				// Check if any _attach_ flags set
				const keys = Object.keys(fields);
				for(let i = 0; i < keys.length; i++)
				{
					if(keys[i].indexOf('_attach_') !== -1)
					{
						// Get document to attach to
						let modelName = keys[i].replace('_attach_', '');
						modelName = modelName.substr(0, modelName.indexOf('_'));
						let fieldName = keys[i].replace('_attach_', '');
						fieldName = fieldName.substr(fieldName.indexOf('_') + 1, fieldName.length);
						const attachableModel = modelMgr.getModel(modelName);
						const attachableRecord = await attachableModel.forId(fields[keys[i]][0]);
						if(!attachableRecord)
						{
							return res.status(200).send({ error: 'Could not find attachable record with ID {' + fields[keys[i]][0] + '}' });
						}

						attachableRecord[fieldName].push(createdRecord._id);
						await attachableRecord.save();

						console.log('[data controller] create New ' + fields.model[0] + ' attached to ' +  fields[keys[i]][0] + ' in model ' + modelName);
					}
				}

				// Need to send out push notifications too via sockets so the alert
				// displays on user's maps when it is created
				Emailer.sendEmailToSupport('alert created', `An alert was created by user email: ${decodedTokenResult.user.email} and id: ${decodedTokenResult.user._id} with location coords: ${fields.location} and note: ${fields.note}`)

				// Handle notifications
				await NotificationManager.HandleSubscriptionsFor(	fields.model[0],
																													'create',
																													createdRecord);

				// Success
				res.status(200).send({
					error: null,
					message: 'Created successfully',
					results: createdRecord,
					token: decodedTokenResult.token
				});
			}
			catch(err)
			{
				console.log('[data controller] error: ' + err);
				res.status(200).send({ error: err.message });
			}
		});
	}
	catch(err)
	{
		console.log(err);
		res.status(200).send({ error: err.message });
	}
});



/**
 	@name delete
	@route {POST}	/delete
	@description Delete a document for specified model
	@authentication Requires a valid x-access-token
	@headerparam 	{JWT} 	x-access-token		Token to decrypt
	@headerparam	{String}	x-request-source 	(web|mobile)
	@headerparam 	{GUID}	x-device-id 	Unique ID of device calling API
	@headerparam 	{String}	x-device-service-name 	(ios|android|chrome|safari)
	@bodyparam 	{String}	model 	  Model record belongs to
 	@bodyparam 	{Array.<String>}	id 	Contains array or string of object IDs to delete
*/
Router.post('/delete', async (req, res) =>
{
	try
  {
		// Validate headers
		const headerValidation = await Ext.validateHeaders(req.headers);
		if(headerValidation.error !== null)
		{
			return res.status(200).send({ error: headerValidation.error });
		}

		// Validate user
		const decodedTokenResult = await Ext.validateToken(req.headers['x-access-token']);
		if(decodedTokenResult.error !== null)
		{
			return res.status(200).send({ error: decodedTokenResult.error });
		}

		if(!req.body.id)
		{
			return res.status(200).send({ error: 'Missing ID' });
		}
		if(!req.body.model)
		{
			return res.status(200).send({ error: 'Missing model' });
		}

    // Locate model
    const modelMgr = ModelManager.GetInstance();
    const mModel = modelMgr.getModel(req.body.model);
    if(mModel === undefined)
    {
      return res.status(200).send({ error: 'Error: d6\nCould not find any model with name {' + req.body.model + '}' });
    }

		const canDelete = await mModel.canPerformAction('delete', decodedTokenResult.user, req.body.id);
		if(!canDelete)
		{
			console.log(decodedTokenResult.user._id.toString() + ' tried to delete ' + req.body.model);
			return res.status(200).send({ error: 'You are not authorized to delete this model type' });
		}

    /*
      TODO: Find if any attachable fields and if so query those models with these object IDs
      if contained then we need to remove or warn user that deletion will affect different model record
    */

		// Delete
		const data = Array.isArray(req.body.id) ? req.body.id : [req.body.id];
		const params = { _id: data };
		const deleted = await mModel.delete(params);

		if(deleted.deletedCount === 0)
		{
			return res.status(200).send({ error: null, message: 'Could not locate ' + req.body.model + ' to delete' });
		}

		// Success
		return res.status(200).send({
			error: null,
			message: req.body.model + ' deleted',
		 	token: decodedTokenResult.token
		});
  }
  catch(err)
  {
    console.log(err);
    res.status(200).send({ error: err });
  }
});


/**
  @name find-attachable
  @function
  @inner
  @description Find any documents from different models that have a reference field to the model specified
  useful in the data manager when creating a new record, if any other models reference this model we can attach the new record to these other models
  on creation. Think like adding a new field and attaching the field to the component in one swoop
  @param 	{JWT}   "headers[x-access-token]"		Token to decrypt
  @param  {String}      name 				Model to filter on
  @returns  {Map.<String, Array.<Mongo.document>>} Map of attachable models.fieldName with array of documents for specific model attachable
	Format: {component.field_name: [Documents]}
	@ignore
 */
Router.post('/find-attachable', async (req, res) =>
{
	try
	{
		// Validate headers
		const headerValidation = await Ext.validateHeaders(req.headers);
		if(headerValidation.error !== null)
		{
			return res.status(200).send({ error: headerValidation.error });
		}

		// Validate user
		const decodedTokenResult = await Ext.validateToken(req.headers['x-access-token'], 'admin');
		if(decodedTokenResult.error !== null)
		{
			return res.status(200).send({ error: decodedTokenResult.error });
		}

    if(!req.body.model)
    {
      return res.status(200).send({ error: 'Missing model parameter'});
    }

		const modelMgr = ModelManager.GetInstance();

    // Find any schemaFields with type = "reference" and reference = model.name and isArray = true
    const schemaFields = await modelMgr.getSchemaFieldDocuments({isArray: true, reference: req.body.model, type: 'reference'}, { _id: 1, name: 1 });

		// Filter out IDs in separate array for easy querying
		const schemaFieldIds = [];
		for(const idx in schemaFields)
		{
			schemaFieldIds.push(schemaFields[idx]._id);
		}

		// Query models to see who schemafields belong to
    const modelParams = {schemaFields: {$in: schemaFieldIds }};
    const sort = { name: 1 };
    const models = await modelMgr.getModelDocuments(modelParams, sort);

    // Build list of documents for each model that we can attach to
    const results = {};
    for(let i = 0; i < models.length; i++)
    {
      const model = modelMgr.getModel(models[i].name);
      if(model === undefined)
      {
        return res.status(200).send({ error: 'Error: d1\nCould not find any attachable model with name {' + models[i].name + '}' });
      }

			// Figure out which field in the model we can attach to
			const coreModelDoc = await model.getCoreDocument();
			let fieldName = '';
			for(let j = 0; j < coreModelDoc.schemaFields.length; j++)
			{
				for(let k = 0; k < schemaFields.length; k++)
				{
					if(schemaFields[k]._id.toString() === coreModelDoc.schemaFields[j]._id.toString())
					{
						fieldName = schemaFields[k].name;
						break;
					}
				}
				if(fieldName !== '')
				{
					break;
				}
			}

			if(fieldName === '')
			{
				return res.status(200).send({ error: 'Could not locate field name for attachable model: ' + coreModelDoc.name});
			}

      const records = await model.find({});
      if(records.length > 0)
      {
        results[models[i].name + '_' + fieldName] = records;
      }
    }

    // Send back list
		res.status(200).send({
			error: null,
			results: results,
			token: decodedTokenResult.token
		});
	}
	catch(err)
	{
		await Log.Error(__filename, err);
		res.status(200).send({ error: err });
	}
});


/**
  @name query
	@route {POST}	/query
 	@description Query a document(s) for specified model
 	@authentication Requires a valid x-access-token
 	@headerparam 	{JWT} 	x-access-token		Token to decrypt
 	@headerparam	{String}	x-request-source 	(web|mobile)
 	@headerparam 	{GUID}	x-device-id 	Unique ID of device calling API
 	@headerparam 	{String}	x-device-service-name 	(ios|android|chrome|safari)
  @bodyparam  {JSON}        params 			Query parameters to filter documents (MongoDB)
  @bodyparam  {String}      name 				Model to query on
  @returns  {Array.<Mongo.document>} Array of documents for specific model requested
 */
Router.post('/query', async (req, res) =>
{
	try
	{
		// Validate headers
		const headerValidation = await Ext.validateHeaders(req.headers);
		if(headerValidation.error !== null)
		{
			return res.status(200).send({ error: headerValidation.error });
		}

		// Validate user
		const decodedTokenResult = await Ext.validateToken(req.headers['x-access-token']);
		if(decodedTokenResult.error !== null)
		{
			return res.status(200).send({ error: decodedTokenResult.error });
		}

    if(!req.body.model)
    {
      return res.status(200).send({ error: 'Missing model parameter'});
    }
    if(!req.body.params)
    {
      return res.status(200).send({ error: 'Missing params parameter'});
    }

    const modelMgr = ModelManager.GetInstance();

		// Query core model
		if(modelMgr.getSystemModels().indexOf(req.body.model) === -1)
		{
	    const mModel = modelMgr.getModel(req.body.model);
	    if(mModel === undefined)
	    {
	      return res.status(200).send({ error: 'Error: d2\nCould not find any model with name {' + req.body.model + '}' });
	    }
	    let results = await mModel.find(req.body.params);

			// Validate query permissions
			const canQuery = await mModel.canPerformAction('query', decodedTokenResult.user);
			if(!canQuery)
			{
				console.log(decodedTokenResult.user._id.toString() + ' tried to query ' + req.body.model);
				return res.status(200).send({ error: 'You are not authorized to query this model type' });
			}
			const doc = await mModel.getCoreDocument(req.body.model);

			// Handle aggregate functions
			// TODO: Standardize these
			// Right now just _attach_comments_
			if(req.body.aggregate && req.body.aggregate === '_attach_comments_')
			{
				const mComment = modelMgr.getModel('comment');
				const newResults = [];
		    for(let i = 0; i < results.length; i++)
		    {
		      newResults.push(JSON.parse(JSON.stringify(results[i])));
		      newResults[i].comments = await mComment.find({ entityId: results[i]._id, entityType: req.body.model }, { createdOn: 1 });
		    }
				results = newResults;
			}

			res.status(200).send({
				error: null,
				model: doc,
				results: results,
				token: decodedTokenResult.token
			});
		}
		// Query system model
		else
		{
			// Validate query permissions
			const doc = await modelMgr.getCoreDocument(req.body.model);
			if(decodedTokenResult.user.authorization.type.indexOf('admin') === -1)
			{
				console.log(decodedTokenResult.user._id.toString() + ' tried to query ' + req.body.model);
				return res.status(200).send({ error: 'You are not authorized to query this model type' });
			}
			const results = await modelMgr.getSchemaFieldDocuments(req.body.params);
			res.status(200).send({ error: null, model: doc, results: results, token: decodedTokenResult.token });
		}
	}
	catch(err)
	{
		await Log.Error(__filename, err);
		res.status(200).send({ error: err });
	}
});


/**
  @name update
	@route {POST}	/update
 	@description Update a document for specified model
 	@authentication Requires a valid x-access-token
 	@headerparam 	{JWT} 	x-access-token		Token to decrypt
 	@headerparam	{String}	x-request-source 	(web|mobile)
 	@headerparam 	{GUID}	x-device-id 	Unique ID of device calling API
 	@headerparam 	{String}	x-device-service-name 	(ios|android|chrome|safari)
  @bodyparam 	{JWT} 	"headers[x-access-token]"		Token to decrypt
  @bodyparam 	{Array.<FormFields>} fields 			Parameters to update in document (MongoDB)
  @bodyparam 	{String}			model 		  Model record belongs to
  @bodyparam  {String}      id          Object ID of the record to update
  @returns {Mongo.document} Updated document
*/
Router.post('/update', async (req, res) =>
{
  try
  {
    const form = new Multiparty.Form();
		form.maxFieldsSize = 20*1024*1024; // 20 MB
		form.maxFilesSize= 20*1024*1024; // 20 MB
    form.parse(req, async (formErr, fields, files) =>
    {
      if(formErr)
      {
        console.log(formErr);
        return res.status(200).send({ error: formErr });
      }

			console.log(fields);
			console.log(files);

      // Required on every call
      if(!fields.id)
      {
        return res.status(200).send({ error: 'Missing ID parameter' });
      }
      if(!fields.model)
      {
        return res.status(200).send({ error: 'Missing model parameter' });
      }

      try
      {
				// Validate user
				const decodedTokenResult = await Ext.validateToken(req.headers['x-access-token']);
				if(decodedTokenResult.error !== null)
				{
					return res.status(200).send({ error: decodedTokenResult.error });
				}

        // Locate record being updated
        const modelMgr = ModelManager.GetInstance();
        const mModel = modelMgr.getModel(fields.model[0]);
        if(mModel === undefined)
        {
          return res.status(200).send({ error: 'Error: d3\nCould not find any model with name {' + fields.model[0] + '}' });
        }
        const record = await mModel.forId(fields.id[0]);
        if(!record)
        {
          return res.status(200).send({ error: 'Error: d4\nCould not find record with ID {' + fields.id[0] + '}' });
        }

				// Validate update permissions
				const canUpdate = await mModel.canPerformAction('update', decodedTokenResult.user, fields.id[0]);
				if(!canUpdate)
				{
					console.log(decodedTokenResult.user._id.toString() + ' tried to update ' + fields.model[0]);
					return res.status(200).send({ error: 'You are not authorized to update this model type' });
				}

				// Build update params
				const coreDoc = await mModel.getCoreDocument();
				const updateParams = await modelMgr.convertFormFieldsToJsonParams(coreDoc.schemaFields, fields, files, decodedTokenResult.user._id);
				const updatedRecord = await mModel.updateById(fields.id[0], updateParams);

				console.log(updatedRecord);

        // Success
        res.status(200).send({ error: null, message: 'Updated successfully', results: updatedRecord, token: decodedTokenResult.token });
      }
      catch(err)
      {
        console.log(err);
        res.status(200).send({ error: err });
      }
    });
  }
  catch(err)
  {
    console.log(err);
    res.status(200).send({ error: err });
  }
});

module.exports = Router;
