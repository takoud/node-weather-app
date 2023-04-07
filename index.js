import * as mqtt from "mqtt"
import * as dotenv from 'dotenv'
import fetch from 'node-fetch'
import { convert } from 'html-to-text'
import { XMLParser, XMLBuilder, XMLValidator} from "fast-xml-parser"

dotenv.config()

/**
 * polyfill permettant à un array de nous renvoyer un élément du tableau
 * avec la plus petite valeur de la proriété qu'on lui passe en paramètre
 * @param attrib
 * @returns {*|null}
 */
Array.prototype.hasMin = function(attrib) {
  return (this.length && this.reduce(function(prev, curr){
    let prevValue = prev[attrib] !== undefined ? prev[attrib] : prev.value
    let currValue = curr[attrib] !== undefined ? curr[attrib] : curr.value

    return prevValue < currValue ?
      { city: prev.city, value: prevValue } : { city: curr.city, value: currValue }
  })) || null
}

/**
 * polyfill permettant à un array de nous renvoyer un élément du tableau
 * avec la plus grande valeur de la proriété qu'on lui passe en paramètre
 * @param attrib
 * @returns {*|null}
 */
Array.prototype.hasMax = function(attrib) {
  return (this.length && this.reduce(function(prev, curr){
    let prevValue = prev[attrib] !== undefined ? prev[attrib] : prev.value
    let currValue = curr[attrib] !== undefined ? curr[attrib] : curr.value

    return prevValue > currValue ?
      { city: prev.city, value: prevValue } : { city: curr.city, value: currValue }
  })) || null
}


try {

  // on lève une exception si le programme n'a pas accès à la variable d'environnement CITIES_XML_LINK
  if (!process.env.CITIES_XML_LINK) {
    throw new Error(
      "Veuillez exécuter le programme avec la variable d'environnement CITIES_XML_LINK"
    )
  }

  const Cities = process.env.CITIES_XML_LINK.split(',')

  let options = {
   host: 'c89325f5fb274e9bab8949ccc933b28a.s2.eu.hivemq.cloud',
    port: 8883,
    protocol: 'mqtts',
    username: 'Takous',
    password: 'Odili@2010'
    //clientId: process.env.MQTT_CLIENT_ID // tester avec ou sans
  }
  
  //let options = {
    //host: 'c89325f5fb274e9bab8949ccc933b28a.s2.eu.hivemq.cloud',
    //port: 8883,
    //protocol: 'mqtts',
    //username: 'Takous',
    //password: 'Odili@2010'
//}

  //const client  = mqtt.connect(process.env.MQTT_BROKER_URL,options)
  const client = mqtt.connect(options);


  client.on('connect', function () {
    console.log("connecté au broker mqtt")

    const citiesDataPromise = Cities.map((link) => {

      return new Promise(async (resolve, reject) => {

        try {

          const response = await fetch(link)
          const body = await response.text()
          const parser = new XMLParser()
          const parsedXMLData = parser.parse(body)

          if (parsedXMLData?.feed?.entry) {

            let cityName = parsedXMLData
              .feed.title
              .split(' - ')[0]
            let item = parsedXMLData
              .feed
              .entry
              .find(e => /Current Conditions/.test(e.title))

            if (item) {

              const convertedData = convert(item.summary)
              const splittedData = convertedData.split('\n')

              let temperature = null
              let temperatureText = splittedData.find(item => /Temperature/.test(item))

              if (temperatureText) {
                let temperatureTab = temperatureText.split(': ')

                if (temperatureTab.length === 2) {
                  temperature = temperatureTab[1].replace('°C', '')
                }
              }

              let humidity = null
              const humidityText = splittedData.find(item => /Humidity/.test(item))

              if (humidityText) {
                let humidityTab = humidityText.split(': ')

                if (humidityTab.length === 2) {
                  humidity = humidityTab[1].replace(' %', '')
                }
              }

              let pressure = null
              const pressureText = splittedData.find(item => /Pressure/.test(item))

              if (pressureText) {
                let pressureTab = pressureText.split(': ')

                if (pressureTab.length === 2) {
                  pressure = pressureTab[1]
                    .replace(/kPa.{1,}/, '')
                    .replace(' ', '')
                }
              }

              return resolve({
                city: cityName,
                temperature: parseFloat(temperature),
                humidity: parseFloat(humidity),
                pressure: parseFloat(pressure)
              })
            }

          }

        } catch (e) {
          return reject(e)
        }

      })

    })

    Promise.all(citiesDataPromise).then((data) => {
      // métrique de la température
      const temperatureMetric = {
        "métrique": {
          "température": {
            min: data.hasMin('temperature'),
            max: data.hasMax('temperature'),
          }
        }
      }

      // métrique de l'humidité
      const humidityMetric = {
        "métrique": {
          "humidité": {
            min: data.hasMin('humidity'),
            max: data.hasMax('humidity'),
          }
        }
      }

      // métrique de la pression
      const pressionMetric = {
        "métrique": {
          "pression": {
            min: data.hasMin('pressure'),
            max: data.hasMax('pressure'),
          }
        }
      }

      client.publish(process.env.MQTT_BROKER_TOPIC, JSON.stringify(temperatureMetric))
      client.publish(process.env.MQTT_BROKER_TOPIC, JSON.stringify(humidityMetric))
      client.publish(process.env.MQTT_BROKER_TOPIC, JSON.stringify(pressionMetric))

      console.log("Données publiées")

    })

  })

} catch (e) {
  console.log(e)
}
