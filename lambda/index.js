'use strict';

const AWS   = require('aws-sdk');
const S3    = new AWS.S3({signatureVersion: 'v4'});
const Sharp = require('sharp');
const http  = require('http'), Stream = require('stream').Transform;
const url   = require('url');
const path  = require('path');


const BUCKET = process.env.BUCKET;
const URL    = process.env.URL;
const DOMAIN = process.env.DOMAIN;
const SIZES  = JSON.parse(process.env.SIZES_NEED);

exports.handler = function(event, context, callback) {
	const key = event.queryStringParameters.key;
	if(!key){
		var error = new SizeNotExist("Key not expecified!");
		callback(error);

		return;
	}

	const match = key.match(/(\d+)x(\d+)\/(.*)/);

	var width       = 0;
	var height      = 0;
	var originalKey = "";
	var resizeKey   = "";
	var is_resize   = 0;

	const myurl = new url.parse(key);
	const filename = path.basename(myurl.pathname);

	if( match ) {
		width = parseInt(match[1], 10);
		height = parseInt(match[2], 10);
		originalKey = match[3];
		is_resize = 1;
		resizeKey = myurl.pathname.substr(1,myurl.pathname.length);
	}else{
		originalKey = myurl.pathname.substr(1,myurl.pathname.length);
	}
 
	function SizeNotExist(message) {
			this.name = "SizeNotExistError";
			this.message = message;
	}

	SizeNotExist.prototype = new Error();

	var find = SIZES.find((size) => {
		return size.width == width && size.height == height;
	})

	var params = {
		Bucket: BUCKET, 
		Key: originalKey
	};

	// Check if image exist on bucket
	S3.headObject(params, function(err, data) {

		if(err) {
		// Image NOT exist on bucket

			http.get(DOMAIN+params.Key, function(res) {
					if(res.statusCode != 200) {
						console.log("Status code not 200: " + res.statusCode + " image: " + DOMAIN+params.Key);

					}else{

						var imagedata = new Stream();

						res.on('data', function(chunk){
								imagedata.push(chunk);
						});

						res.on('end', function(chunk){

							var data = {
							Key: params.Key,
							Body: imagedata.read(),
							Bucket: BUCKET,
							ContentType: res.headers['content-type'],
							StorageClass: "REDUCED_REDUNDANCY",
							Expires: new Date(+new Date + 12096e5)
						};

						S3.putObject(data, function(err, data){
							if (err) { 
									console.log('Error uploading data: ', data);
									callback(err);
									return; 
								} else {

								if ( is_resize == 1 ){

										if (!find) {
											var error = new SizeNotExist("This size expecified is not registered! width: " + width + " height:" +height);
											callback(error);
											return;
										}

										S3.getObject(params).promise()
										.then(data => Sharp(data.Body)
											.resize(width, height)
											.toFormat('png')
											.toBuffer()
										)
										.then(buffer => S3.putObject({
												Body: buffer,
												Bucket: BUCKET,
												ContentType: 'image/png',
												Key: resizeKey,
												StorageClass: "REDUCED_REDUNDANCY",
												Expires: new Date(+new Date + 12096e5),
											}).promise()
										)
										.then(() => callback(null, {
												statusCode: '301',
												headers: {'location': `${URL}/${key}`},
												body: '',
											})
										)
										.catch(err => callback(err))
										return;
									}

								}
						});

						});
			
					}
				});
	
		}else{
			// Yes! image  already exist on Bucket
		
			if (!find) {
				var error = new SizeNotExist("This size expecified is not registered! width: " + width + " height:" +height);
				callback(error);
				return;
			}

			S3.getObject(params).promise()
			.then(data => Sharp(data.Body)
				.resize(width, height)
				.toFormat('png')
				.toBuffer()
			)
			.then(buffer => S3.putObject({
					Body: buffer,
					Bucket: BUCKET,
					ContentType: 'image/png',
					Key: resizeKey,
					StorageClass: "REDUCED_REDUNDANCY",
					Expires: new Date(+new Date + 12096e5),
				}).promise()
			)
			.then(() => callback(null, {
					statusCode: '301',
					headers: {'location': `${URL}/${key}`},
					body: '',
				})
			)
			.catch(err => callback(err))

		}

	});	
	
}