#!/usr/bin/env node

var express = require('express');
var http = require('http')
var path = require('path');
var soap = require('soap');
var url = require('url');
var querystring = require('querystring');
var Step = require('Step');
var xml2js = require('xml2js');
var xmlparser = new xml2js.Parser();
var fs = require('fs');
var xmlbuilder = require('xmlbuilder');
var socketio = require('socket.io');

var app = express();

app.configure(function(){
	app.set('port', process.env.PORT || 3000);
	app.set('views', __dirname + '/views');
	app.set('view engine', 'jade');
	app.use(express.favicon());
	app.use(express.logger('dev'));
	app.use(express.bodyParser());
	app.use(express.methodOverride());
	app.use(express.cookieParser('123456789987654321'));
	app.use(express.session());
	app.use(app.router);
	app.use(require('stylus').middleware(__dirname + '/public'));
	app.use(express.static(path.join(__dirname, 'public')));
});

app.configure('development', function(){
	app.use(express.errorHandler());
});

var server = http.createServer(app).listen(app.get('port'), function(){
	console.log("Express server listening on port " + app.get('port'));
});

// Socket IO
var io = socketio.listen(server);
io.set('log level', 0);

app.get('/', function (req, res){
	res.render('index', { title: 'Kinepolis Jammer' });
});

app.post('/rest/start', function (req, res){
	start(req.body.url, parseInt(req.body.tickets), function (err, obj){
		res.json(obj);
	});
});



function start(reservationurl, nrOfTickets, callback){
	var parsedUrl = url.parse(reservationurl);
	var query = querystring.parse(parsedUrl.query);
	//console.log(query);

	callback(null, query);

	var soap = require('soap');


	soap.createClient('http://www.megatix.be/wsNtaTs/wsWWWntaTS.dll/wsdl/IwsWWWNtaTs', function (err, client) {
		console.log("client created");

		var sessionid;

		Step(
			function (){

				console.log('CreateNewWebSession');
				client.CreateNewWebSession({
					iServerPack: 0,
					iWebSession: 0,
					iErrorCode: 0,
					iErrorCategory: 0,
					sWebApplication: query.WEBAPP
				}, this);
			},

			function (err, res) {
				if(err) throw err;

				io.sockets.emit('CreateNewWebSessionData', { res: res });

				console.log("Sessions created: iWebSession: " + res.iWebSession);

				sessionid = res.iWebSession;

				console.log('QuickStart');
				client.QuickStart({
					iSessionId: sessionid,
					sCountry: query.CNTR,
					sCompId: query.COMPID,
					iFeatId: query.COMPFEATID,
					sPerfDate: query.PERFDATE,
					sPerfTime: query.PERFTIME,
					sPerfHall: query.PERFHALL,
					iPromoSubscription: 0,
					sOptinsToAdd: ''
				}, this);
			},

			function (err, res) {
				if(err) throw err;

				io.sockets.emit('QuickStartData', { res: res });

				// fs.writeFile('result.xml', res.return, function (err) {
				// 	if (err) return console.log(err);
				// });

				xmlparser.parseString(res.return, this);
			},

			function (err, res) {
				if(err) throw err;

				var reservationxml = buildReservationXML(query, res, nrOfTickets);

				var reservationxmlString = reservationxml.toString({ pretty: true });

				// console.log(reservationxmlString);
				// console.log(reservationxml.toString({ pretty: true }));



				console.log('CreateReservation');
	     	 	client.CreateReservation({
					iWebSession: sessionid,
					sCouId: query.CNTR, //BE
					xmlReservation: reservationxmlString,
					sLanguage: query.LNG //NL
				}, this);

			},

			function (err, res) {
				if(err) throw err;

				//console.log(res);

				io.sockets.emit('CreateReservationData', { res: res });

				console.log("done");

				fs.writeFile('zaaldata_handicapt_loveseats.xml', res.return, function (err) {
					if (err) return console.log(err);
				});

				xmlparser.parseString(res.return, this);
			},

			function (err, res){
				var xmlseats = res.WS_WWW_NTA_TS_RESPONSE.WS_RESPONSE[0].CreateReservation[0].ZONE_SEATS[0].seat;
				var hallWidth = res.WS_WWW_NTA_TS_RESPONSE.WS_RESPONSE[0].CreateReservation[0].HALL[0].HALL_WIDTH[0];
				var hallHeight = res.WS_WWW_NTA_TS_RESPONSE.WS_RESPONSE[0].CreateReservation[0].HALL[0].HALL_HEIGHT[0];
				var ownSeatRequest = res.WS_WWW_NTA_TS_RESPONSE.WS_RESPONSE[0].CreateReservation[0].SEATING_REQUEST[0];




				console.log(hallWidth);

				var seats = [];
				for(var i in xmlseats){
					seats.push(xmlseats[i].$);
				}
				//console.log(seats);

				io.sockets.emit('seats', {
					seats: seats,
					width: hallWidth,
					height: hallHeight,
					ownSeatRequest: ownSeatRequest
				});
			}
		);


	});
}


function buildReservationXML(query, resultjson, nrOfTickets){
	var data = resultjson.WS_WWW_NTA_TS_RESPONSE.WS_RESPONSE[0].QUICK_START[0];

	var complexes = data.COMPLEXES[0].COMPLEX;
	var myComplex = null;
	for(var i in complexes){
		var complex = complexes[i];

		if(complex.COMP_ID[0] == query.COMPID){
			myComplex = complex;
			break; //stop loop
		}
	}

	console.log(myComplex);

	var doc = xmlbuilder.create();
	var docbuilder = doc.begin('RESERVATION')
		.ele('RES_GUID')
		.up()
		.ele('COMPLEX_ID')
			.txt(query.COMPID) //KOOST
		.up()
		.ele('COMPLEX_NAME')
			.txt(myComplex.COMP_INT_NAME[0]) //Kinepolis Oostende
		.up()
		.ele('COMPLEX_CURRENCY')
			.txt(myComplex.COMP_CURRENCY[0]) //EUR
		.up()
		.ele('FEATURE_ID')
			.txt(data.FEATURE_ID[0]) //246838
		.up()
		.ele('FEATURE_NAME')
			.txt(data.NAME[0]) //OV MAN OF STEEL
		.up()
		.ele('PERF_DATE')
			.txt(data.FEATURE_DATE[0]) //20130703
		.up()
		.ele('PERF_TIME')
			.txt(data.TIME[0]) //13:45
		.up()
		.ele('PERF_NBR')
			.txt(data.PERF_NBR[0]) //1
		.up()
		.ele('PERF_HALL')
			.txt(data.HALL_NAME[0]) //3
		.up()
		.ele('PERF_HALL_NBR')
			.txt(data.HALL[0]) //3
		.up()
		.ele('PERF_HALL_VERSION')
		.up()
		.ele('PRICES');

	for(var i in data.PRICES[0].PRICE){
		var priceAttr = data.PRICES[0].PRICE[i].$;
		var item = docbuilder.ele('PRICE');
		item.att('NMBR', priceAttr.NMBR);
		item.att('VALUE', priceAttr.VALUE);
		item.att('CODE', priceAttr.CODE);
		item.att('HASH', priceAttr.HASH);
	}

	docbuilder.up()
		.ele('TYPE')
			.txt(data.TYPE[0]) //XNRM
		.up()
		.ele('USE_SEAT_RESERVATION')
			.txt('1') //1
		.up()
		.ele('USES_PARKING')
			.txt(myComplex.COMP_USES_PARKING[0]) //0
		.up()
		.ele('TICKET_COUNT')
			.txt(nrOfTickets) //2
		.up()
		.ele('USE_THIS_ZONE').up()
		.ele('SEAT_REQUEST').up()
		.ele('STRATEGY')
			.txt(data.STRATEGY[0]) //NORB
		.up()
		.ele('TREED')
			.txt(data.THREED[0]) //0
		.up()
		.ele('DIGITAL')
			.txt(data.DIGITAL[0]) //1
		.up()
		.ele('RATING')
			.txt(data.RATING[0]) //0+
		.up()
		.ele('COMBI_TYPE')
			.txt(data.COMBI_TYPE[0]) //0
		.up()
		.ele('EXTRA_TICKET_TEXT')
		.up()
		.ele('PAYED_BY_VOUCHER')
		.up()
		.ele('VALIDATED_AS_STUDENT')
		.up()
		.ele('ACCEPT_VOUCHERS')
			.txt(myComplex.COMP_ACCEPT_VOUCHER[0]) //1
		.up()
		.ele('THREE_D_GLASSES')
			.txt(myComplex.COMP_THREE_D_GLASSES[0]) //0
		.up()
		.ele('PRODUCT_QUANTITY')
			.txt('0') //0
		.up()
		.ele('PRODUCT_FULL_NAME')
		.up()
		.ele('PRODUCT_SEQ')
		.up()
		.ele('PRODUCT_UNIT')
		.up()
		.ele('PRODUCT_TYPE')
		.up()
		.ele('PRODUCT_WEIGHT')
		.up()
		.ele('PRODUCT_STOCKLOCATION')
		.up()
		.ele('PRODUCT_PRICE')
		.up()
		.ele('PRODUCT_VATPCT')
		.up()
		.ele('PRODUCTS_PAYED_BY_VOUCHER')
		.up()
		.ele('PARKING_RESERVATION_AMOUNT')
		.up()
		.ele('PARKING_RESERVATION_COUNT')
		.up()
		.ele('PARKING_RESERVATION_SESSION');

	return doc;
}

