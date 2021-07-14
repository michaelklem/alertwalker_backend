const symbols = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_-".split("");

/**
	Reverse a string
	@param 	{String}	str 	String to reverse
	@returns {String}	Reversed string
*/
function reverse(str)
{
  return str.split("").reverse().join("");
}

/**
	Convert a number to base
	@param 	{Number}	num 	Number to convert
	@param 	{Int}			base 	base value to convert it to
	@returns {Number}	Converted number
*/
function toBase(num, base)
{
    let decimal = num;
    let temp = -1;
    let conversion = "";

    if (base > symbols.length || base <= 1)
		{
        throw new RangeError("Radix must be less than " + symbols.length + " and greater than 1");
    }

    while (decimal > 0)
		{
        temp = Math.floor(decimal / base);
        conversion = symbols[(decimal - (base * temp))] + conversion;
        decimal = temp;
    }

    return conversion;
}


/**
		Convert long mongo DB object ID to short version for url usage
		@param 	{ObjectId}	longId 		Long object ID
		@returns {String}		Short version
*/
module.exports = function getShortId(longId)
{
	try
	{
		let shortId = '';

		// Convert hex to int and only use last 3 digits
		let counter = parseInt(longId.toHexString().slice(-6), 16);
		counter = parseInt(counter.toString().slice(-3), 10);

		// Add counter to timestamp so we have some variation on the time
		let time = longId.getTimestamp().getTime();
		time += counter;

		// Conver to base 64 for url usage
		shortId = toBase(time, 64);
		/* Slice off the first, least variating, character
	  	this lowers the entropy, but brings us to 6 characters, which is nice.
	   	This will cause a roll-over once every two years, but the counter and the rest of the timestamp should make it unique (enough)
			*/
		shortId = shortId.slice(1);

		// Reverse so that the first 2 characters have most variation
		shortId = reverse(shortId);
		return shortId;
	}
	catch(err)
	{
		console.log(err.stack);
	}
};
