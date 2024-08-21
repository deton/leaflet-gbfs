import './L.GBFS.css';

import {
  Layer, GeoJSON, Marker, Icon, DivIcon, LatLng, setOptions,
} from 'leaflet';

// const iconUrl = require('./images/bike_icon.png');
const iconUrl = new URL('./images/bike_icon.png', document.currentScript.src);

const GBFS = Layer.extend({
  options: {
    gbfsURL: '',
    gbfsFiles: null,
    language: null,
    start: true,
    interval: 60 * 1000,
    onlyRunWhenAdded: false,
    bikeMarkerColor: 'white',
    bikeMarkerBgColor: 'silver',
    stationMarkerBgColor: '#8C2BF2',
    showStationPopup: true,
    showBikePopup: true,
  },

  initialize(options) {
    setOptions(this, options);
    this.container = new GeoJSON(null, options);
    this.updating = false;

    if (this.options.start && !this.options.onlyRunWhenAdded) {
      this.start();
    }
  },

  async start() {
    if (this.feeds) { // already started
      return this;
    }
    if (this.options.gbfsFiles) {
      this.stations = {};
      this.feeds = {};
      for (const f of this.options.gbfsFiles) {
        if (f.name === 'station_information.json') {
          this.feeds.stationInformation = f;
        } else if (f.name === 'station_status.json') {
          this.feeds.stationStatus = f;
        } else if (f.name === 'system_information.json') {
          // eslint-disable-next-line no-await-in-loop
          const systemInfoText = await f.text();
          this.systemInformation = JSON.parse(systemInfoText);
        }
      }
      this.update();
      return this;
    }
    try {
      const gbfsResponse = await fetch(this.options.gbfsURL);
      const gbfs = await gbfsResponse.json();
      if (this.options.language) {
        if (!Object.prototype.hasOwnProperty.call(gbfs.data, this.options.language)) {
          throw new Error(`defined language (${this.options.language}) missing in gbfs file`);
        }
      } else {
        const languages = Object.keys(gbfs.data);
        if (languages.length === 0) {
          throw new Error('GBFS has no languages defined');
        } else {
          this.options.language = languages[0];
        }
      }

      const feeds = gbfs.data[this.options.language].feeds;
      const systemInformation = feeds.find((el) => el.name === 'system_information');
      const systemInfoResponse = await fetch(systemInformation.url);
      this.systemInformation = await systemInfoResponse.json();

      const stationInformation = feeds.find((el) => el.name === 'station_information');
      const stationStatus = feeds.find((el) => el.name === 'station_status');
      const freeBikeStatus = feeds.find((el) => el.name === 'free_bike_status');
      // const vehicleTypes = feeds.find((el) => el.name === 'vehicle_types');

      this.feeds = {
        stationInformation, stationStatus, freeBikeStatus, // vehicleTypes,
      };
      this.stations = {};

      if (!this.timer && this.options.interval > 0) {
        this.timer = setInterval(() => this.update(), this.options.interval);
        this.update();
      }
    } catch (err) {
      console.warn(err);
      this.fire('error', { error: err });
    }

    return this;
  },

  stop() {
    if (this.timer) {
      clearTimeout(this.timer);
      delete this.timer;
    }

    return this;
  },

  isRunning() {
    return this.timer !== undefined;
  },

  isUpdating() {
    return this.updating;
  },

  async update() {
    if (typeof this.feeds === 'undefined') {
      return this;
    }
    try {
      this.updating = true;
      let stationStatus;
      let stations;
      if (typeof this.feeds.stationStatus.url === 'string') {
        const stationStatusResponse = await fetch(this.feeds.stationStatus.url);
        stationStatus = await stationStatusResponse.json();
      } else {
        const stationStatusText = await this.feeds.stationStatus.text();
        stationStatus = JSON.parse(stationStatusText);
      }
      let freeBikeStatus;
      if (typeof this.feeds.freeBikeStatus !== 'undefined') {
        const freeBikeStatusResponse = await fetch(this.feeds.freeBikeStatus.url);
        freeBikeStatus = await freeBikeStatusResponse.json();
      }
      let vehicleTypes;
      if (typeof this.feeds.vehicleTypes !== 'undefined') {
        const vehicleTypesResponse = await fetch(this.feeds.vehicleTypes.url);
        vehicleTypes = await vehicleTypesResponse.json();
      }

      this.container.clearLayers();

      for (const status of stationStatus.data.stations) {
        if (status.is_installed) {
          let station = this.stations[status.station_id];
          if (!station) {
            /* eslint-disable no-await-in-loop */
            if (typeof this.feeds.stationInformation.url === 'string') {
              const stationInformationResponse = await fetch(this.feeds.stationInformation.url);
              stations = await stationInformationResponse.json();
            } else {
              const stationInformationText = await this.feeds.stationInformation.text();
              stations = JSON.parse(stationInformationText);
            }
            /* eslint-enable */
            stations.data.stations.forEach((st) => {
              this.stations[st.station_id] = st;
            });
            station = this.stations[status.station_id];
          }
          const icon = new DivIcon({
            html: this.getStationIconHtml(status.num_bikes_available, status.num_docks_available),
            bgPos: [16, 16],
            iconSize: [32, 32],
            popupAnchor: [0, -21],
            className: 'station-icon',
          });
          const point = new LatLng(station.lat, station.lon);
          const marker = new Marker(point, {
            icon,
          });
          if (this.options.showStationPopup) {
            marker.bindPopup(`<b>${station.name}</b><br>Available bikes: <b>${status.num_bikes_available}</b>`);
          }
          marker.on('click', (e) => this.fire('stationClick', { event: e, station, status }));
          marker.addTo(this.container);
        }
      }

      const icon = new Icon({
        iconSize: [32, 32],
        popupAnchor: [0, -20],
        iconUrl,
      });

      if (typeof freeBikeStatus !== 'undefined') {
        freeBikeStatus.data.bikes.forEach((bike) => {
          const point = new LatLng(bike.lat, bike.lon);
          const marker = new Marker(point, {
            icon,
          });
          if (this.options.showBikePopup) {
            marker.bindPopup('Bike available');
          }
          marker.on('click', (e) => this.fire('bikeClick', { event: e, bike }));
          marker.addTo(this.container);
        });
      }

      const dataUpdate = { stationStatus };
      if (typeof stations !== 'undefined') dataUpdate.stations = stations;
      if (typeof freeBikeStatus !== 'undefined') dataUpdate.freeBikeStatus = freeBikeStatus;
      if (typeof vehicleTypes !== 'undefined') dataUpdate.vehicleTypes = vehicleTypes;
      this.fire('data', dataUpdate);
    } catch (err) {
      this.updating = false;
      console.warn(err);
      this.fire('error', { error: err });
    }

    this.updating = false;
    return this;
  },

  getBounds() {
    if (this.container.getBounds) {
      return this.container.getBounds();
    }

    throw new Error('Container has no getBounds method');
  },

  onAdd(map) {
    map.addLayer(this.container);
    if (this.options.start) {
      this.start();
    }
  },

  onRemove(map) {
    if (this.options.onlyRunWhenAdded) {
      this.stop();
    }

    map.removeLayer(this.container);
  },

  getStationIconHtml(bikes, docks) {
    let stationCss = `background: ${this.options.stationMarkerBgColor};`;
    if (bikes === 0) {
      stationCss = `background: color-mix(in srgb, ${this.options.stationMarkerBgColor} 50%, transparent);`;
    }
    const degree = (bikes / (bikes + docks)) * 360;
    let ringCss = `
      background: ${this.options.bikeMarkerColor};
      background-image:
        linear-gradient(${90 + degree}deg, transparent 50%, ${this.options.bikeMarkerBgColor} 50%),
        linear-gradient(90deg, ${this.options.bikeMarkerBgColor} 50%, transparent 50%);
    `;

    if (degree > 180) {
      ringCss = `
        background: ${this.options.bikeMarkerColor};
        background-image:
          linear-gradient(${degree - 90}deg, transparent 50%, ${this.options.bikeMarkerColor} 50%),
          linear-gradient(90deg, ${this.options.bikeMarkerBgColor} 50%, transparent 50%);
      `;
    }
    return `
      <div class="station-icon-ring" style="${ringCss}">
        <div class="station-icon-inner" style="${stationCss}">${bikes}</div>
      </div>
    `;
  },
});

export default GBFS;
