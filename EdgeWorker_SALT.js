import { createResponse } from 'create-response';
import { httpRequest } from 'http-request';
import { logger } from 'log';
import { TextDecoderStream, TextEncoderStream } from 'text-encode-transform';
import { ReadableStream, WritableStream } from 'streams';
import { btoa } from "encoding";

const REQUEST = "request";
const RESPONSE = "response";
const labelsGen = (env, region) => {
    let res = {};
    if (typeof env !== 'undefined') res['env'] = env;
    if (typeof region !== 'undefined') res['region'] = region;
    return res;
}

const UNSAFE_REQUEST_HEADERS = new Set(['host', 'content-length', 'vary', 'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'transfer-encoding', 'trailers']);
const UNSAFE_RESPONSE_HEADERS = new Set(['content-length', 'transfer-encoding', 'connection', 'vary', 'accept-encoding', 'content-encoding', 'keep-alive',
    'proxy-authenticate', 'proxy-authorization', 'te', 'trailers', 'upgrade']);

const filterKeys = (obj, keysToRemove) => {
    return Object.fromEntries( // convert the entries back to object
        Object.entries(obj) // convert the object to entries
            .filter(([k]) => !keysToRemove.has(k)) // remove entries with keys that exist in the Set
    );
}

class StreamDuplicator {
    constructor(callback) {
        let readController = null;
        let result = [];
        this.readable = new ReadableStream({
            start(controller) {
                readController = controller;
            }
        });

        this.writable = new WritableStream({
            write(text) {
                readController.enqueue(text);
                result.push(text);
            },
            close(controller) {
                callback(result.join(""));
                readController.close();
            }

        });
    }
}

const responseProvider = async (request) => {
    const timeout = 15000;
    const debug = request.getHeader('debug');
    const UUID = request.getVariable('PMUSER_UUID');
    const Authorization = request.getVariable('PMUSER_AUTHORIZATION');
    const ENV = request.getVariable('PMUSER_ENV');
    const REGION = request.getVariable('PMUSER_REGION');
    const body = await request.body

    const labels = labelsGen(ENV, REGION)
    let date = new Date();
    let requestBody = "";

    const originalRequest = {
        body: body.pipeThrough(new TextDecoderStream())
            .pipeThrough(new StreamDuplicator((result) => requestBody = result))
            .pipeThrough(new TextEncoderStream()),
        headers: filterKeys(request.getHeaders(), UNSAFE_REQUEST_HEADERS),
        method: request.method,
        timeout: timeout,
    }

    return httpRequest(`${request.scheme}://${request.host}${request.url}`, originalRequest)
        .then(response => {
            const saltRequestCallback = (responseBody) => {
                const saltBody = {
                    "request":
                    {
                        "timestamp": date,
                        "originalClientIp": request.getHeader('true-client-ip')[0],
                        "method": request.method,
                        "uri": request.url,
                        "httpVersion": "1.1",
                        "headers": encodeHeaders(request.getHeaders()),
                        "body": btoa(_utf8_encode(requestBody))
                    },
                    "response":
                    {
                        "timestamp": date,
                        "httpVersion": "1.1",
                        "statusCode": response.status.toString(),
                        "headers": encodeHeaders(response.getHeaders()),
                        "body": btoa(_utf8_encode(responseBody))
                    },
                    "props":
                    {
                        "uuid": UUID,
                        "version": "[[VERSION]]",
                        "platform": "akamai-edgeworker",
                    }
                };
                if (Object.keys(labels).length !== 0) {
                    saltBody.props.labels = labels;
                }
                const requestOptions = {
                    method: 'POST',
                    headers:
                    {
                        "Authorization": "Basic " + Authorization,
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify(saltBody),
                    redirect: 'follow'
                }

                httpRequest(`https://${request.host}/fakepath/saltsec/v1/http/exchange`, requestOptions)
            }

            if (debug == 'yes') {
                return httpRequest(`https://${request.host}/fakepath/saltsec/v1/http/exchange`, requestOptions)
                    .then(res1 => res1.text()
                        .then(resBody => { logger.log("res: " + (resBody)) }
                        )
                    );
            }
            else {
                return createResponse(
                    response.status,
                    filterKeys(response.getHeaders(), UNSAFE_RESPONSE_HEADERS),
                    response.body.pipeThrough(new TextDecoderStream())
                        .pipeThrough(new StreamDuplicator(saltRequestCallback))
                        .pipeThrough(new TextEncoderStream()))
            }
        })
        .catch(error => {
            logger.log('Error ', error.toString())
            return createResponse(400, {}, error.toString());
        })
}


function encodeHeaders(headers) {
    return Object.entries(headers).map(([key, value]) => `${key}: ${value}`);
}


var _utf8_encode = function (string) {
    //   string = string.replace(/\r\n/g,"\n");
    var utftext = "";
    for (var n = 0; n < string.length; n++) {
        var c = string.charCodeAt(n);
        if (c < 128) {
            utftext += String.fromCharCode(c);
        }
        else if ((c > 127) && (c < 2048)) {
            utftext += String.fromCharCode((c >> 6) | 192);
            utftext += String.fromCharCode((c & 63) | 128);
        }
        else {
            utftext += String.fromCharCode((c >> 12) | 224);
            utftext += String.fromCharCode(((c >> 6) & 63) | 128);
            utftext += String.fromCharCode((c & 63) | 128);
        }
    }
    return utftext;
}

export { responseProvider }
