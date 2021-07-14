const Mongo 		= require('mongoose');

const Schema =
{
  // Name of field/attribute
	name: 	      { type: String, required: true,  maxlength: 64,   minlength: 1, lowercase: false,  trim: true,  unique: false },
  // Types: string, secure, reference, number, boolean, file, datetime, date, select, point
	type: 	      { type: String,  required: true,  maxlength: 16,  minlength: 4, lowercase: true,   trim: true,  unique: false },
	required: 	  { type: Boolean, required: true },
	// -9999999999999 to 9999999999999 (almost 10 trillion). 0 to 8192 for string
	minLength: 	  { type: Number, required: true },
  maxLength: 	  { type: Number, required: true },
  lowercase: 	  { type: Boolean, required: true },
  trim: 	      { type: Boolean, required: true },
  unique: 	    { type: Boolean, required: true },
  // Name of Model this is referencing if type is Reference (leave blank to ignore)
  reference: 	  { type: String, required: true,  maxlength: 64,   minlength: 0, lowercase: false,  trim: true,  unique: false },
	// Key in model we are referencing to display instead of object ID
	keyInReference: { type: String, required: true,  maxlength: 64,   minlength: 0, lowercase: false,  trim: true,  unique: false },
  // Auto populate (reference type only)
  autoPopulate: { type: Boolean, required: true },
	/* Controls if this property displays on the update form for admins
		if false then only code can set this property ^_^ no human overrides */
	managedUpdateForm: { type: Boolean, required: true },
	// Controls if the data type is an array or single value
	isArray: { type: Boolean, required: true },
	// Used in select type (comma separated list of values to display in drop down)
	values:  { type: String, required: false, maxlength: 256, minlength: 0, lowercase: false, trim: false, unique: false },
	// Displayed on form above input
	label: 	 { type: String, required: false, maxlength: 64,   minlength: 0, lowercase: false,  trim: true,  unique: false },

	// Displayed on form as detailed explanation
	tooltip: 	 { type: String, required: false, maxlength: 256,   minlength: 0, lowercase: false,  trim: true,  unique: false },
	// This is the text displayed above the tooltip ex: "What is this?"
	tooltipQuestion: { type: String, required: false, maxlength: 64,   minlength: 0, lowercase: false,  trim: true,  unique: false },
	// Type of tool tip (onlabel|sidebutton)
	tooltipType: { type: String, required: false, maxlength: 16,   minlength: 0, lowercase: false,  trim: true,  unique: false }
}

/* eslint-disable sort-keys */
const CoreSchema = new Mongo.Schema(Schema, { timestamps: { createdAt: 'createdOn', updatedAt: 'updatedOn' } });

/**
  Represents a property in a model
*/
class SchemaField
{
  // MARK: - Data fields
  static CoreModel = Mongo.model('schemaField', CoreSchema);


	/**
		This simulates getCoreDocument for a system model
		@returns	{JSON}	Schema fields
	*/
	static GetCoreSchemaJson()
	{
		return Schema;
	}

	/**
    Create new document
    @param 	{JSON} 	params		JSON formatted params
  	@returns {Mongo.document} 	Newly created document
  */
  static async Create(params)
  {
		// TODO: Figure out how we can still index large text fields
		if(params.type === 'text')
		{
			params.index = (params.maxLength === -1 || params.maxLength > 1024 ? false : true);
		}
    const result = await SchemaField.CoreModel.create(params);
    return result;
  }

	/**
		Delete documents
		@param  {JSON}  params    JSON formatted params to filter on for deletion
		@returns  {JSON}  {n: Matched documents, ok: 1(success), deletedCount: deleted documents}
		or Error if object has committments preventing it from being deleted
	*/
	static async Delete(params)
	{
		try
		{
			const result 	= await SchemaField.CoreModel.deleteMany(params).exec();
			return result;
		}
		catch(err)
		{
			console.log(err);
			console.log(err.stack);
			throw err;
		}
	}

	/**
    Find many documents
    @param 	{JSON} 		params  	JSON params to filter on
    @param  {JSON}    sort      Sort filter to apply
    @returns {Array.<Mongo.document>?} array or null if not found
  */
  static async Find(params, sort = {_id: 1})
  {
    try
    {
      return await SchemaField.CoreModel.find(params).sort(sort).exec();
    }
    catch(err)
    {
      console.log(err.message);
      throw err;
    }
  }

	/**
    Find a document with specified ID
    @param 	  {String}  id  	Unique identifier for document
    @returns  {Mongo.document?}   object or null if not found
   */
  static async ForId(id)
  {
    try
    {
      const doc = await SchemaField.CoreModel.findById(id).exec();
      return doc;
    }
    catch(err)
    {
      console.log(err.message);
      throw err;
    }
  }
}
/* eslint-enable sort-keys */
module.exports = SchemaField;
