const BCrypt = require('bcryptjs');
const Fs    = require('fs');
const {Log, Model, SchemaField} = require('../model');
const Mongo = require('mongoose');
const ReadFile    = require('fs-readfile-promise');
const UtilityManager = require('./utilityManager');


/**
  Singleton that manages the core models
*/
class ModelManager
{
  // MARK: - Data fields
  static #instance = null;

  // Format: {k: model.name, v: Model}
  #models = null;

  // System models are ones that are written in code not in the database
  #systemModels = ["log", "model", "schemaField"];

  //#userSelectFields = 'username email authorization.type authorization.homepage name photo firstName lastName password';
  #userSelectFields = 'username email authorization name photo firstName lastName password';

  #utilityMgr = null;

  // MARK: - Constructor
  constructor()
  {
    if(ModelManager.#instance !== null)
    {
      throw new Error('Attempt to instantiate multiple instances of ModelManager refused');
    }
    this.#models = new Map();
    this.#utilityMgr = UtilityManager.GetInstance();
  }

  /**
    Singleton accessor
    @returns {ModelManager} Only instance of model manager
  */
  static async Init()
  {
    if(ModelManager.#instance === null)
    {
      ModelManager.#instance = new ModelManager();

      // Create Mongo Models from Model/SchemaField collections
      const result = await ModelManager.#instance.populateModels();
      if(!result)
      {
        // Database is empty, load essential models from disk
        await ModelManager.#instance.loadSchema('local');
        console.log('ModelManager instantiated successfully from local: true');
      }
      else
      {
        console.log('ModelManager instantiated successfully from remote: ' + result);
      }
    }
    return ModelManager.#instance;
  }

  /**
    Singleton accessor non-async
    @returns {ModelManager} Only instance of model manager
  */
  static GetInstance()
  {
    if(ModelManager.#instance === null)
    {
      throw new Error('Model Manager not instantiated');
    }
    return ModelManager.#instance;
  }


  // MARK: - Model map loading/retrieval
  /**
    Populate the model dictionary with all user made models
    Instantiates one Model object per document
    @returns {Bool}  True if successful or false if error or nothing populated
  */
  async populateModels()
  {
    try
    {
      const params = {};
      const sort = { name: 1 };

      // Fetch all model documents
      const modelDocs = await Model.CoreModel.find(params).populate('schemaFields').sort(sort).exec();

      // Populate map
      for(let i = 0; i < modelDocs.length; i++)
      {
        console.log('[ModelManager] populateModels name: ' + modelDocs[i].name)
        this.#models.set(modelDocs[i].name, new Model(modelDocs[i]));
      }
      return (modelDocs.length > 0 ? true : false);
    }
    catch(err)
    {
      console.log('Stack: ' + err.stack + '\nMessage: ' + err.message);
      return false;
    }
  }

  /**
    Retrieve Model object
    @param  {String}  name  The name of the model requested
    @returns {Model}  The Model object for the requested model
  */
  getModel(name)
  {
    return this.#models.get(name);
  }

  /**
    Retrieve Models map
    @returns {JSON} k: model.name, v: Model
  */
  getModels()
  {
    return this.#models;
  }

  getUserSelectFields()
  {
    return this.#userSelectFields;
  }

  /**
    Add model object to map
    @param  {Model}  model  The model to be added (Will overwrite if already exists)
    @returns {_} Nothing
  */
  addModel(model)
  {
    this.#models.set(model.name, model);
  }

  /**
    Remove model object from map
    @param  {String}  name  The name of the model to remove
    @returns {_} Nothing
  */
  removeModel(name)
  {
    this.#models.delete(name);
  }

  // MARK: - Core model manipulation
  /**
    Create new model object
    @param  {String}  name  The name of the new model
    @param  {String}  description   Description of the new model
    @param  {Array.<SchemaField>} schemaFields  Array of schema field objects representing the attributes of the model
    @returns  {Model}   newly created model object
  */
  async createModel(name, description, schemaFields = [])
  {
    // Create document and then object
    let doc = await Model.CoreModel.create(
    {
      description: description,
      name: name,
      schemaFields: schemaFields,
      tableProperties: Model.DefaultTableProps,
      permissions: Model.DefaultPermissionProps
    });
    // Hacky workaround to populate the document's schema fields
    doc = await Model.CoreModel.findOne({name: name}).exec();

    const model = new Model(doc);
    // Save in list
    this.addModel(model);
    return model;
  }

  /**
    Create new schema field object
    @param 	{String}	name 	  	Name of attribute
  	@param 	{String}	type 			string, secure, reference, number, boolean, file
  	@param 	{Bool}		required 	If this attribute can be blank or not
  	@param 	{Int}			minLength	Minimum amount of characters or value for a number
  	@param 	{Int}			maxLength Maximum amount of characters or value for a number
  	@param 	{Bool}		lowercase If a string it will be lower cased
  	@param 	{Bool}		trim 			Trim leading and trailing white space
  	@param 	{Bool}		unique 		If attribute can have multiple documents with the same value
  	@param 	{String}	reference Name of another Model that is being represented here
  	@param 	{String}	keyInReference Field in reference model to display on forms instead of objectId
  	@param 	{Bool}		autoPopulate 	Auto populate reference field
    @param 	{Bool}		managedUpdateForm 	Controls if this field is allowed to be edited by admin in Data Manager
    @param  {Bool}    isArray     Controls if data type is array or single value
    @param  {String}  values  Comma separated list of values
    @param  {String}  label   Label to display on form
    @param  {String}  tooltip Detailed explanation that is displayed in tooltip
  	@param 	{String}	tooltipQuestion 	The text displayed above/near the tooltip itself
  	@param 	{String}	tooltipType 	The type of tooltip (onlabel|sidebutton)
    @param  {String}  modelName Name of model (Optional)
    @return {Mongo.document}  Newly created schema field document
  */
  async createSchemaField(name,
                          type,
                          required,
                          minLength,
                          maxLength,
                          lowercase,
                          trim,
                          unique,
                          reference,
                          keyInReference,
                          autoPopulate,
                          managedUpdateForm,
                          isArray,
                          values,
                          label,
                          tooltip,
                          tooltipQuestion,
                          tooltipType,
                          modelName = '')
  {
    // Setting max to -1 on required form input will break things
    let max = maxLength;
    if(type === 'boolean' && max === -1)
    {
      max = 9999999999999;
    }
    if(type === 'select' && max === -1)
    {
      max = 9999999999999;
    }
    if((type === 'date' && max === -1) || (type === 'datetime' && max === -1))
    {
      max = 9999999999999;
    }
    if(type === 'point' && max === -1)
    {
      max = 9999999999999;
    }
    const schemaCreateParams =
    {
      autoPopulate: autoPopulate,
      isArray: isArray,
      keyInReference: keyInReference,
      label: label,
      lowercase: lowercase,
      managedUpdateForm: managedUpdateForm,
      maxLength: max,
      minLength: minLength,
      name: name,
      reference: reference,
      required: required,
      tooltip: tooltip,
      tooltipType: tooltipType,
      tooltipQuestion: tooltipQuestion,
      trim: trim,
      type: type,
      unique: unique,
      values: values
    };
    const schemaDoc = await SchemaField.Create(schemaCreateParams);

    // If model then add this schema field to the model
    if(modelName.length > 0)
    {
      // Add new schema document ID to existing schema fields array
      const model = this.getModel(modelName);
      const modelDoc = await model.getCoreDocument();
      const schemaFields = modelDoc.schemaFields;
      schemaFields.push(schemaDoc._id);

      // Update core document with new schema fields
      const update = { schemaFields: schemaFields };
      await model.updateCore(update);
      this.addModel(model);
    }

    return schemaDoc;
  }


  /**
    Update existing schema field object
    @param 	{String}	name 	  	Name of attribute
  	@param 	{String}	type 			string, secure, reference, number, boolean, file
  	@param 	{Bool}		required 	If this attribute can be blank or not
  	@param 	{Int}			minLength	Minimum amount of characters or value for a number
  	@param 	{Int}			maxLength Maximum amount of characters or value for a number
  	@param 	{Bool}		lowercase If a string it will be lower cased
  	@param 	{Bool}		trim 			Trim leading and trailing white space
  	@param 	{Bool}		unique 		If attribute can have multiple documents with the same value
  	@param 	{String}	reference Name of another Model that is being represented here
    @param 	{String}	keyInReference Field in reference model to display on forms instead of objectId
  	@param 	{Bool}		autoPopulate 	Auto populate reference field
    @param 	{Bool}		managedUpdateForm 	Controls if this field is allowed to be edited by admin in Data Manager
    @param  {Bool}    isArray         Control if the value is an array of single
    @param  {String}  values  Comma separated list of values
    @param  {String}  label   Label to display on form
    @param	{String}	tooltip 			Tool tip message
  	@param 	{String}	tooltipQuestion 	The text displayed above/near the tooltip itself
  	@param 	{String}	tooltipType 	The type of tooltip (onlabel|sidebutton)
    @param  {String}  id     ObjectId of schema field being updated
    @return {Mongo.document}  Newly created schema field document
  */
  async updateSchemaField(name,
                          type,
                          required,
                          minLength,
                          maxLength,
                          lowercase,
                          trim,
                          unique,
                          reference,
                          keyInReference,
                          autoPopulate,
                          managedUpdateForm,
                          isArray,
                          values,
                          label,
                          tooltip,
                          tooltipQuestion,
                          tooltipType,
                          id)
  {
    const schemaDoc = await SchemaField.ForId(id);

    schemaDoc.name = name;
    schemaDoc.type = type;
    schemaDoc.required = required;
    schemaDoc.minLength = minLength;
    schemaDoc.maxLength = maxLength;
    schemaDoc.label = label;
    schemaDoc.lowercase = lowercase;
    schemaDoc.trim = trim;
    schemaDoc.tooltip = tooltip;
    schemaDoc.tooltipQuestion = tooltipQuestion;
    schemaDoc.tooltipType = tooltipType;
    schemaDoc.unique = unique;
    schemaDoc.reference = reference;
    schemaDoc.keyInReference = keyInReference;
    schemaDoc.autoPopulate = autoPopulate;
    schemaDoc.managedUpdateForm = managedUpdateForm;
    schemaDoc.isArray = isArray;
    schemaDoc.values = values;
    schemaDoc.label = label;
    await schemaDoc.save();

    return schemaDoc;
  }

  /**
    Delete a model object
    @param    {String}  name  The name of the model
    @returns  {Bool}   True if created successfully
  */
  async deleteModel(name)
  {
    const model = this.getModel(name);

    // Remove all data in this model
    await model.delete({});

    // Remove schema field documents from SchemaField collection
    const modelDoc = await model.getCoreDocument();
    const schemaFieldIds = [];
    for(let i = 0; i < modelDoc.schemaFields.length; i++)
    {
      schemaFieldIds.push(modelDoc.schemaFields[i]._id);
    }
    const params = { _id: { $in: schemaFieldIds } };
    await SchemaField.Delete(params);

    // Remove model document from Model collection
    const result = await Model.CoreModel.deleteMany({ name: name });

    // Remove model object from Manager map
    this.removeModel(name);

    // Remove model from mongo cache
    Mongo.deleteModel(name);

    // Drop collection from database
    Mongo.connection.db.dropCollection(name + 's', (err, dropResult) =>
    {
      if(err)
      {
        console.log(err);
        console.log(err.stack);
      }
      else
      {
        console.log(name + ' has been dropped successful: '  + (dropResult.ok === 1));
        return (dropResult.ok === 1);
      }
    });
    console.log(result);
    return result;
  }

  /**
    Delete a schema field from a model
    @param    {String}  modelName     The name of the model, pass in null to delete orphan schema field
    @param    {String}  schemaFieldId The object ID of the schema field to remove, can be an array
    @returns  {Model?}   Updated model or null if modelName is null
  */
  async deleteSchemaField(modelName, schemaFieldId)
  {
    try
    {
      let model = null;

      // Update model document
      if(modelName !== null)
      {
        model = this.getModel(modelName);
        const modelDoc = await model.getCoreDocument();
        const schemaFields = modelDoc.schemaFields;
        for(let i = 0; i < schemaFields.length; i++)
        {
          //console.log(schemaFields[i]._id.toString() + ' == ' + schemaFieldId);
          if(schemaFields[i]._id.toString() === schemaFieldId)
          {
            schemaFields.splice(i, 1);
          }
        }
        await model.updateCore({ schemaFields: schemaFields });

        // Update model object
        this.addModel(modelName, model);
      }

      // Remove schema field document from SchemaField collection
      const params = { _id: { $in: schemaFieldId } };
      await SchemaField.Delete(params);

      // Return updated model
      return (modelName === null ? null : model);
    }
    catch(err)
    {
      console.log(err);
      throw err;
    }
  }

  /**
    Retrieve documents from Model collection
    @param  {JSON}  params  Query parameters to filter collection (MongoDB)
    @param  {JSON}  sort    Parameter to sort by, default is name desc
    @returns {Array.<Mongo.document>} Array of documents of type Model
  */
  async getModelDocuments(params, sort = { name: 1 })
  {
    const results = await Model.CoreModel.find(params).sort(sort).exec();
    return results;
  }

  /**
    Retrieve documents from SchemaField collection
    @param  {JSON}  params  Query parameters to filter collection (MongoDB)
    @param  {JSON}  sort    Parameter to sort by, default is name desc
    @returns {Array.<Mongo.document>} Array of documents of type SchemaField
  */
  async getSchemaFieldDocuments(params, sort = { name: 1 })
  {
    const results = await SchemaField.Find(params, sort);
    return results;
  }

  /**
    Rename a model collection
    @param  {String}  oldName     Old name of collection
    @param  {String}  newName     New name of collection
    @returns {Bool}  True on success/false on error
  */
  async updateModelCollectionName(oldName, newName)
  {
    // TODO: This throws an error, I think the oldName needs to have an 's added to it
    console.log("Renaming " + oldName + " to " + newName);
    const result = await Mongo.connection.db.collection(oldName + 's').rename(newName + 's');
    console.log(result);
    return true;
  }

  /**
    Backup all modeled documents to S3
    @returns {Bool}  True on success/false on error
  */
  async backupModelRecords()
  {
    const mConfiguration = this.getModel('configuration');
    const awsS3Bucket = await mConfiguration.findOne({name: 'AWS_S3_BUCKET'});

		// Iterate models and store documents
		const keys = this.#models.keys();
		let keyItr = keys.next();
		while(!keyItr.done)
		{
      if(keyItr.value)
      {
        const mModel = this.#models.get(keyItr.value);
        console.log(keyItr.value);
        const documents = await mModel.findNoPopulate({}, {_id: 1});
        const path = 'backup/' + mModel.name + '.json';
        await this.#utilityMgr.get('s3').UploadData(JSON.stringify(documents), path, 'application/json', awsS3Bucket.value);
      }
      keyItr = keys.next();
		}
    return true;
  }

  /**
    Backup all models and schema to S3
    @returns {Bool}  True on success/false on error
  */
  async backupSchema()
  {
    const mConfiguration = this.getModel('configuration');
    const awsS3Bucket = await mConfiguration.findOne({name: 'AWS_S3_BUCKET'});

		const models = await this.getModelDocuments({});
    const path = 'backup/models.json';
    await this.#utilityMgr.get('s3').UploadData(JSON.stringify(models), path, 'application/json', awsS3Bucket.value);
    return true;
  }

  /**
    Retrieve default schema fields every model will have
    @returns {Array.<SchemaField>} Schema fields
  */
  getDefaultSchemaFields()
  {
    return Model.DefaultSchemaFields;
  }

  /**
    Retrieve document for core model
    @note This is a helper to account for schemaField references as that is not a "core model" it is a "system model"
    @param  {String}  modelName   Name of model
    @returns {Array.<SchemaField>} Schema fields
  */
  async getCoreDocument(modelName)
  {
    if(modelName !== 'schemaField')
    {
      return await this.getModel(modelName).getCoreDocument();
    }
    return SchemaField.GetCoreSchemaJson();
  }

  /**
    Retrieve list of system models
    @returns  {Array.<String>}  System models list
  */
  getSystemModels()
  {
    return this.#systemModels;
  }

  /**
    Load schema from S3
    @param  {String}  source  (remote|local) controls if reading schema from disk or S3
    @returns {Bool}  True on success/false on error
  */
  async loadSchema(source = 'local')
  {
    const S3 = this.#utilityMgr.get('s3');
    let mConfiguration = null;
    let awsS3Bucket = null;

    // Load file
    let schemaFile = null;
    let models = null;
	  if(source === 'remote')
    {
      mConfiguration = this.getModel('configuration');
      awsS3Bucket = await mConfiguration.findOne({name: 'AWS_S3_BUCKET'});
      schemaFile = await S3.GetFile('backup/models.json', awsS3Bucket.value);
      models = JSON.parse(schemaFile.Body.toString());
    }
    else
    {
      schemaFile = await ReadFile('core-data/models.json', 'utf8');
      models = JSON.parse(schemaFile);
    }

    // Need to do authorization, user, pushToken, pushNotification first as they are core models that other models reference
    // and avoid MissingSchemaError
    // TODO: Make this better, this algorithm doesn't work 100% of the time because it inserts in correct order but doesn't process list in correct order
    const modelPositions = ['authorization', 'user', 'pushtoken', 'pushnotification', 'subscribableevent', 'field', 'component'];
    let sortedModels = [];

    // Iterate models that need to be in order
    for(let i = 0; i < modelPositions.length; i++)
    {
      // Find in main DS
      for(let j = 0; j < models.length; j++)
      {
        if(models[j].name === modelPositions[i])
        {
          sortedModels.push({...models[j]});
          break;
        }
      }
    }

    // Now add on remainder of models
    for(let i = 0 ; i < models.length; i++)
    {
      if(modelPositions.indexOf(models[i].name === -1))
      {
        sortedModels.push(models[i]);
      }
    }


    models = sortedModels;

    // Counters for stats
    let modelsImported = 0;
    let dataImported = 0;

    // Iterate models
    for(let i = 0; i < models.length; i++)
    {
      const existingModel = this.getModel(models[i].name);
      if(!existingModel)
      {
        // Create all schema fields as they are populated already in the JSON file
        for(let k = 0; k < models[i].schemaFields.length; k++)
        {
          try
          {
            // Create schema field document and replace object with Id in array
            const schemaField = await SchemaField.Create(models[i].schemaFields[k]);
            models[i].schemaFields[k] = schemaField._id;
          }
          catch(err)
          {
            console.log(models[i].schemaFields[k]);
            console.log(err);
            throw err;
          }
        }
        // Create model
        let modelDoc = await Model.CreateAndPopulateCoreDoc(models[i]);
        this.#models.set(modelDoc.name, new Model(modelDoc));
        const model = this.getModel(modelDoc.name);

        modelsImported++;

        // Load data for this model
        let data = null;
        if(source === 'remote')
        {
          const dataFile = await S3.GetFile('backup/' + model.name + '.json', awsS3Bucket.value);
          data = JSON.parse(dataFile.Body.toString());
        }
        else
        {
          // Load data locally
          if(Fs.existsSync('core-data/' + model.name + '.json'))
          {
            const dataFile = await ReadFile('core-data/' + model.name + '.json', 'utf8');
            data = JSON.parse(dataFile);
          }
          else
          {
            data = [];
          }
        }

        // Create record for each item in data set
        for(let k = 0; k < data.length; k++)
        {
          // If we're setting up a new install here are certain configurations that need to be wiped
          if(models[i].name === 'configuration' && source === 'local')
          {
            // Will tell environment manager to setup a new S3 bucket for us
            if(data[k].name === 'AWS_S3_BUCKET')
            {
              data[k].value = "-1";
            }
            // Will tell environment manager to save the S3 URL as our url
            else if(data[k].name === 'FRONTEND_URL')
            {
              data[k].value = "";
            }
          }
          await model.createAsIs(data[k]);
          dataImported++;
        }
      }
      else
      {
        console.log('Skipping restore for: ' + models[i].name);
      }
    }

    console.log('Imported ' + modelsImported + ' models\nImported ' + dataImported + ' documents');
    return true;
  }


  /**
    Convert form fields to JSON formatted params
    @param  {Array.<SchemaField>}  schemaFields   Schema to validate against
    @param  {Array.<FormField>} fields  Form fields which contain the values for a new record
    @param  {Array.<FormField>} files  Form files which contain the values for a new record
    @param  {String}            userId  ID of the user committing the file upload
    @returns  {JSON}  JSON formatted params that can be passed to any mongo method
  */
  async convertFormFieldsToJsonParams(schemaFields, fields, files, userId)
  {
    const mConfiguration = this.getModel('configuration');
    const awsS3Bucket = await mConfiguration.findOne({name: 'AWS_S3_BUCKET'});

    // This will make the requesting user the user field value if not specified
    // Check if user
    let userSchemaFieldExists = false;
    for(let j = 0; j < schemaFields.length; j++)
    {
      if(schemaFields[j].name === 'user')
      {
        userSchemaFieldExists = true;
        break;
      }
    }
    if(userSchemaFieldExists)
    {
      if(!fields.user)
      {
        fields.user = [userId];
      }
    }


    //console.log(fields);
    const createParams = {};
    // Do fields first
    let keys = Object.keys(fields);
    //console.log(keys);
    for(let i = 0; i < keys.length; i++)
    {
      /* Filter out model and id as those are required API params
          _attach_ comes in format: _attach_{modelname}
          which indicates that the create API needs to attach the created record to an existing component
          and the value of this field will be the object ID of the record in the model to attach to
          */
      if(keys[i] !== 'model' && keys[i] !== 'id' && keys[i].indexOf('_attach_') === -1)
      {
        // Validate schema field exists
        let schemaField = null;
        for(let j = 0; j < schemaFields.length; j++)
        {
          if(schemaFields[j].name === keys[i])
          {
            schemaField = schemaFields[j];
            break;
          }
        }
        if(schemaField === null)
        {
          throw new Error('Schema field ' + keys[i] + ' is illegal');
        }

        // Can't indicate empty array value with form data so pass sentinal value
        if(fields[keys[i]][0] === '_empty_array_')
        {
          // Make sure schema allows array type
          if(!schemaField.isArray)
          {
            throw new Error(schemaField.name + ' is not an array type. Empty array value unaccepable.');
          }
          createParams[keys[i]] = [];
        }
        else if(fields[keys[i]][0] === '_null_')
        {
          createParams[keys[i]] = null;
        }
        // To remove a file we need to specify this since we can't append an empty file to form data
        else if(fields[keys[i]][0] === '_delete_file_')
        {
          createParams[keys[i]] = '_delete_file_';
        }
        else
        {
          if(schemaField.isArray)
          {
            // Multi select comes in as string :( make it into array
            if(fields[keys[i]][0].indexOf(',') !== -1)
            {
              //console.log('Converting multi select string');
              createParams[keys[i]] = fields[keys[i]][0].split(',');
            }
            else
            {
              //console.log('Converting multi select array');
              //console.log(fields[keys[i]]);
              createParams[keys[i]] = fields[keys[i]];
            }
          }
          // Not an array data type
          else
          {
            // Not required fields come in with 'undefined' value
            let fieldValue = fields[keys[i]][0];
            if(fieldValue === undefined || fieldValue === 'undefined')
            {
              /*  For reference field that is not required no value is required.
                  Passing a blank value to Mongo schema will blow up
              */
              if(schemaField.type === 'reference' && !schemaField.required)
              {
                // Do nothing
              }
              else
              {
                createParams[keys[i]] = '';
              }
            }
            else
            {
              // Hash it if it's a secure value
              if(schemaField.type === 'secure')
              {
                fieldValue = await BCrypt.hash(fieldValue, 8);
              }
              else if(schemaField.type === 'point')
              {
                createParams[keys[i]] =
                {
                  type: 'Point',
                  coordinates: JSON.parse(fieldValue)
                };
              }
              else
              {
                createParams[keys[i]] = fieldValue;
              }
            }
          }
        }
      }
    } // End for each field

    // Do files next
    keys = Object.keys(files);
    //console.log(keys);
    for(let i = 0; i < keys.length; i++)
    {
      if(keys[i] !== 'model' && keys[i] !== 'id')
      {
        // Validate schema field exists
        let schemaField = null;
        for(let j = 0; j < schemaFields.length; j++)
        {
          if(schemaFields[j].name === keys[i])
          {
            schemaField = schemaFields[j];
            break;
          }
        }
        if(schemaField === null)
        {
          throw new Error('Schema field ' + keys[i] + ' is illegal');
        }

        if(schemaField.type !== 'file')
        {
          throw new Error('Schema field ' + keys[i] + ' is not a file');
        }

        // Handle multiple files
        if(schemaField.isArray)
        {
          const fileKeys = Object.keys(files[keys[i]]);
          createParams[keys[i]] = [];
          for(let j = 0; j < fileKeys.length; j++)
          {
            const url = await this.#utilityMgr.get('s3').Upload(files[keys[i]][fileKeys[j]], userId, fields.model[0], keys[i], awsS3Bucket.value);
            createParams[keys[i]].push(url);
          }
        } // Single file
        else
        {
          createParams[keys[i]] = await this.#utilityMgr.get('s3').Upload(files[keys[i]][0], userId, fields.model[0], keys[i], awsS3Bucket.value);
        }
      }
    }
    console.log(createParams);
    return createParams;
  }


  /**
    Convert JSON fields to JSON formatted params
    @param  {Array.<SchemaField>}  schemaFields   Schema to validate against
    @param  {Array.<FormField>} fields  JSON fields which contain the values for a new record
    @param  {String}            userId  ID of the user committing the file upload
    @returns  {JSON}  JSON formatted params that can be passed to any mongo method
  */
  async convertJsonFieldsToJsonParams(schemaFields, fields, userId)
  {
    // This will make the requesting user the user field value if not specified
    // Check if user
    let userSchemaFieldExists = false;
    for(let j = 0; j < schemaFields.length; j++)
    {
      if(schemaFields[j].name === 'user')
      {
        userSchemaFieldExists = true;
        break;
      }
    }
    if(userSchemaFieldExists)
    {
      if(!fields.user)
      {
        fields.user = [userId];
      }
    }


    //console.log(fields);
    const createParams = {};
    // Do fields first
    let keys = Object.keys(fields);
    //console.log(keys);
    for(let i = 0; i < keys.length; i++)
    {
      /* Filter out model and id as those are required API params
          _attach_ comes in format: _attach_{modelname}
          which indicates that the create API needs to attach the created record to an existing component
          and the value of this field will be the object ID of the record in the model to attach to
          */
      if(keys[i] !== 'model' && keys[i] !== 'id' && keys[i].indexOf('_attach_') === -1)
      {
        // Validate schema field exists
        let schemaField = null;
        for(let j = 0; j < schemaFields.length; j++)
        {
          if(schemaFields[j].name === keys[i])
          {
            schemaField = schemaFields[j];
            break;
          }
        }
        if(schemaField === null)
        {
          throw new Error('Schema field ' + keys[i] + ' is illegal');
        }

        // Can't indicate empty array value with form data so pass sentinal value
        if(fields[keys[i]] === '_empty_array_')
        {
          // Make sure schema allows array type
          if(!schemaField.isArray)
          {
            throw new Error(schemaField.name + ' is not an array type. Empty array value unaccepable.');
          }
          createParams[keys[i]] = [];
        }
        else if(fields[keys[i]] === '_null_')
        {
          createParams[keys[i]] = null;
        }
        // To remove a file we need to specify this since we can't append an empty file to form data
        else if(fields[keys[i]] === '_delete_file_')
        {
          createParams[keys[i]] = '_delete_file_';
        }
        else
        {
          if(schemaField.isArray)
          {
            // Multi select comes in as string :( make it into array
            if(fields[keys[i]].indexOf(',') !== -1)
            {
              //console.log('Converting multi select string');
              createParams[keys[i]] = fields[keys[i]].split(',');
            }
            else
            {
              //console.log('Converting multi select array');
              //console.log(fields[keys[i]]);
              createParams[keys[i]] = fields[keys[i]];
            }
          }
          // Not an array data type
          else
          {
            // Not required fields come in with 'undefined' value
            let fieldValue = fields[keys[i]][0];
            if(fieldValue === undefined || fieldValue === 'undefined')
            {
              /*  For reference field that is not required no value is required.
                  Passing a blank value to Mongo schema will blow up
              */
              if(schemaField.type === 'reference' && !schemaField.required)
              {
                // Do nothing
              }
              else
              {
                createParams[keys[i]] = '';
              }
            }
            else
            {
              // Hash it if it's a secure value
              if(schemaField.type === 'secure')
              {
                fieldValue = await BCrypt.hash(fieldValue, 8);
              }
              else if(schemaField.type === 'point')
              {
                createParams[keys[i]] =
                {
                  type: 'Point',
                  coordinates: JSON.parse(fieldValue)
                };
              }
              else
              {
                createParams[keys[i]] = fieldValue;
              }
            }
          }
        }
      }
    } // End for each field
    console.log(createParams);
    return createParams;
  }

}
module.exports = ModelManager;
