/* global Module */

/* Magic Mirror
 * Module: MMM-Meater
 *
 * By
 * MIT Licensed.
 */

Module.register("MMM-Meater", {
	defaults: {
		updateInterval: 60000,
		initialDelay: 2000,
		retryDelay: 5000,
		urlApi: "https://public-api.cloud.meater.com/v1",
		email: "",
		password: "",
		roundTemperature: false,
		showCookName: true,
		showTemperatureTarget: true,
		showTemperaturePeak: false,
		showTimeElapsed: true,
		showTimeRemaining: true,
		showCooksOnly: true
	},

	requiresVersion: "2.1.0", // Required version of MagicMirror

	start: function() {
		Log.info("Starting module: " + this.name);

		//Flag for check if module is loaded
		this.loaded = false;

		// Schedule update timer.
		this.devices = [];
		this.getAuthorizationToken();
		this.scheduleUpdate(this.config.initialDelay)
	},

	getAuthorizationToken: function () {
		const self = this;

		const urlApi = this.config.urlApi+"/login";

		const params = {
			email: this.config.email,
			password: this.config.password
		}

		const dataRequest = new XMLHttpRequest();
		dataRequest.open("POST", urlApi, true);

		dataRequest.setRequestHeader("Content-Type", "application/json");

		dataRequest.onreadystatechange = function() { // Call a function when the state changes.
			if (this.readyState === 4) {
				if (this.status === 200) {
					let jsonResponse = JSON.parse(this.response);
					self.authorizationToken = jsonResponse.data.token;
				} else {
					Log.error(self.name, "Could not load data.");
					Log.error(this.response)
				}
			}
		}
		dataRequest.send(JSON.stringify(params))
	},

	/*
	 * getData
	 * function example return data and show it in the module wrapper
	 * get a URL request
	 *
	 */
	updateMeaterData: function() {
		const self = this;

		const urlApi = this.config.urlApi+"/devices";
		let retry = true;

		const dataRequest = new XMLHttpRequest();
		dataRequest.open("GET", urlApi, true);
		dataRequest.setRequestHeader("Authorization", "Bearer: "+this.authorizationToken)
		dataRequest.onreadystatechange = function() {
			if (this.readyState === 4) {
				if (this.status === 200) {
					self.processMeaterData(JSON.parse(this.response));
				} else if (this.status === 401) {
					self.updateDom(self.config.animationSpeed);
					// show authorization error
					self.getAuthorizationToken();
				} else {
					Log.error(self.name, "Could not load data.");
					retry = false;
				}
				if (retry) {
					self.scheduleUpdate((self.loaded) ? -1 : self.config.retryDelay);
				}
			}
		};
		dataRequest.send();
	},

	/* scheduleUpdate()
	 * Schedule next update.
	 *
	 * argument delay number - Milliseconds before next update.
	 *  If empty, this.config.updateInterval is used.
	 */
	scheduleUpdate: function(delay) {
		let nextLoad = this.config.updateInterval;
		if (typeof delay !== "undefined" && delay >= 0) {
			nextLoad = delay;
		}
		const self = this;
		setTimeout(function() {
			self.updateMeaterData();
		}, nextLoad);
	},

	getDom: function() {
		const wrapper = document.createElement("div");

		if (this.authorizationToken === "") {
			wrapper.innerHTML = "Please check your email/password settings in the config for module: " + this.name + ".";
			wrapper.className = "dimmed light small";
			return wrapper;
		}

		if (!this.loaded) {
			wrapper.innerHTML = this.translate("LOADING");
			wrapper.className = "dimmed light small";
			return wrapper;
		}

		const table = document.createElement("table");
		table.className = "small";

		const degreeLable = "°";

		for (let d in this.devices) {
			const device = this.devices[d];

			console.log(device.isCook)

			if (this.config.showCooksOnly && !device.isCook) {
				continue;
			}

			const row1 = document.createElement("tr");
			const row2 = document.createElement("tr");
			if (this.config.colored) {
				row1.className = "colored";
			}
			table.appendChild(row1);
			table.appendChild(row2);

			if (this.config.showCookName && device.name) {
				const nameCell = document.createElement("td");
				nameCell.innerHTML = device.name;
				nameCell.rowSpan = 2;
				row1.appendChild(nameCell);
			}

			if (this.config.showTemperatureTarget && device.targetTemperature) {
				const targetTemperatureCell = document.createElement("td");
				targetTemperatureCell.innerHTML = device.targetTemperature+degreeLable;
				targetTemperatureCell.rowSpan = 2;
				row1.appendChild(targetTemperatureCell);
			}

			const internalTemperatureCell = document.createElement("td");
			internalTemperatureCell.innerHTML = device.internalTemperature+degreeLable;
			internalTemperatureCell.className = "fa fa-home"
			row1.appendChild(internalTemperatureCell);

			const ambientTemperatureCell = document.createElement("td");
			ambientTemperatureCell.innerHTML = device.ambientTemperature+degreeLable;
			row2.appendChild(ambientTemperatureCell);



			if (this.config.showTimeElapsed && device.elapsedTime) {
				const elapsedTimeCell = document.createElement("td");
				elapsedTimeCell.innerHTML = device.elapsedTime;
				row1.appendChild(elapsedTimeCell);
			}

			if (this.config.showTimeRemaining && device.remainingTime) {
				const remainingTimeCell = document.createElement("td");
				remainingTimeCell.innerHTML = device.remainingTime;
				row2.appendChild(remainingTimeCell);
			}

		}

		return table;
	},

	getScripts: function() {
		return [];
	},

	getStyles: function () {
		return [
			"MMM-Meater.css", "font-awesome.css"
		];
	},

	getTranslations: function() {
		return {
			en: "translations/en.json",
			de: "translations/de.json",
		};
	},

	processMeaterData: function(data) {

		this.devices = [];

		const self = this;

		let deviceData = {};

		let deviceList = data.data.devices;

		for (let i = 0, count = deviceList.length; i < count; i++) {

			const device = deviceList[i];

			deviceData = {
				id: device.id,
				internalTemperature: self.roundTemperature(device.temperature.internal),
				ambientTemperature: self.roundTemperature(device.temperature.ambient),
				targetTemperature: self.roundTemperature(device.cook?.temperature.target),
				peakTemperature: self.roundTemperature(device.cook?.temperature.peak),
				name: device.cook?.name,
				elapsedTime: self.toHHMMSS(device.cook?.time.elapsed),
				remainingTime: self.toHHMMSS(device.cook?.time.remaining),
				isCook: device.cook !== null
			};
			this.devices.push(deviceData);
		}

		this.loaded = true;
		this.updateDom(this.config.animationSpeed);
	},

	toHHMMSS: function(timestamp) {

		if(timestamp === undefined) {
			return null;
		}

		if(timestamp === -1) {
			return this.translate("CALCULATING");
		}

		const sec_num = parseInt(timestamp, 10);
		let hours   = Math.floor(sec_num / 3600);
		let minutes = Math.floor((sec_num - (hours * 3600)) / 60);
		let seconds = sec_num - (hours * 3600) - (minutes * 60);


		if (hours   < 10) {hours   = "0"+hours;}
		if (minutes < 10) {minutes = "0"+minutes;}
		if (seconds < 10) {seconds = "0"+seconds;}
		return hours+':'+minutes+':'+seconds;
	},

	roundTemperature: function (temperature) {
		if(temperature === undefined) {
			return null;
		}

		var decimals = this.config.roundTemperature ? 0 : 1;
		return parseFloat(temperature).toFixed(decimals);
	},

});
