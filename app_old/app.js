#!/usr/bin/env node

var url = require('url');
var querystring = require('querystring');
var Step = require('Step');
var xml2js = require('xml2js');
var xmlparser = new xml2js.Parser();
var fs = require('fs');
var xmlbuilder = require('xmlbuilder');



var reservationurl = "https://www.megatix.be/KineWebNtaTS/KineWebNtaTs.dll/GetPage?APP=WWW&PAGE=FLASHDETECT&FRAME=NTAWWWTicketSales&OBJ=0&SETTINGS=https://www.megatix.be/wsNtaTs/Settings/NTAWWWTicketSalesDefaultSettings.xml&__utma=173348921.296110248.1372767801.1372879993.1372879995.6&__utmb=173348921.3.10.1372879995&__utmc=173348921&__utmk=234061278&__utmv=-&__utmx=-&__utmz=173348921.1372767801.1.1.utmcsr=%28direct%29|utmccn=%28direct%29|utmcmd=%28none%29&CNTR=BE&COMPFEATID=246838&COMPID=KOOST&DevDetDeviceDetected=1&LNG=NL&PERFDATE=20130704&PERFHALL=3&PERFTIME=13:45&REFERER=http://kinepolis.be/nl/films/man-steel?theater=48&theater_name=kinepolis-oostende&WEBAPP=NTAWWWTS";


var parsedUrl = url.parse(reservationurl);

var query = querystring.parse(parsedUrl.query);
//console.log(query);


var soap = require('soap');


soap.createClient('http://www.megatix.be/wsNtaTs/wsWWWntaTS.dll/wsdl/IwsWWWNtaTs', function (err, client) {
	console.log("client created");

	var sessionid;
	var nrOfTickets = 2;

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

			// fs.writeFile('result.xml', res.return, function (err) {
			// 	if (err) return console.log(err);
			// });

			xmlparser.parseString(res.return, this);
		},

		function (err, res) {
			if(err) throw err;

			var reservationxml = buildReservationXML(query, res, nrOfTickets);

			var reservationxmlString = reservationxml.toString({ pretty: true });

			console.log(reservationxmlString);
			// console.log(reservationxml.toString({ pretty: true }));



			console.log('CreateReservation');
     	 	client.CreateReservation({
				iWebSession: sessionid,
				sCouId: query.CNTR, //BE
				xmlReservation: reservationxmlString,
				sLanguage: 'NL'
			}, this);

		},

		function (err, res) {
			if(err) throw err;

			//console.log(res);

			console.log("done");

			// fs.writeFile('zaaldata50.xml', res.return, function (err) {
			// 	if (err) return console.log(err);
			// });
		}
	);


});





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

