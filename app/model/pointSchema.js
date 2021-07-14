const Mongo 		= require('mongoose');
// Represent a point for geofencing
const PointSchema = new Mongo.Schema(
{
  type:
  {
    type: String,
    enum: ['Point'],
    default: 'Point',
    required: true
  },
  coordinates:
  {
    type: [Number],
    required: true,
  }
});

module.exports = PointSchema;
