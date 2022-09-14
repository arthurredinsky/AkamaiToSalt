import { createResponse } from 'create-response';
import { httpRequest } from 'http-request';
import { ReadableStream, WritableStream } from 'streams';
import { TextEncoderStream, TextDecoderStream } from 'text-encode-transform';
import { logger } from 'log';

const omit = (obj, attr) => {
    const keysToRemove = new Set(attr.flat()); // flatten the props, and convert to a Set
  
    return Object.fromEntries( // convert the entries back to object
        Object.entries(obj) // convert the object to entries
        .filter(([k]) => !keysToRemove.has(k)) // remove entries with keys that exist in the Set
    );
}

const isRequestBody = method => ((method === 'POST') || (method === 'PUT') || (method === 'DELETE') || (method === 'PATCH')) ? true : false
const responseProvider = async (request) => {
    const reqOptions = {
        headers: omit(
           request.getHeaders(),
           ['host','vary', 'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'transfer-encoding', 'trailers']
           )
    }

    let date = new Date();
    const httpRequestOptions =  isRequestBody(request.method)
                                ? {                                   
                                    ...{
                                        body: await request.text(),
                                        
                                    }, 
                                 ...reqOptions
                                }
                                :  reqOptions

const debug = request.getHeader('debug')
const UUID = request.getVariable('PMUSER_UUID');
const Authorization = request.getVariable('PMUSER_AUTHORIZATION');
const ENV = request.getVariable('PMUSER_ENV');
const REGION = request.getVariable('PMUSER_REGION');
const values = isRequestBody(request.method) ?  httpRequestOptions.body.replace(/\+/g,' ') : ""
const hed = {}
hed.body = values
hed.headers = httpRequestOptions.headers
hed.method = request.method

    return   httpRequest(`https://${request.host}${request.url}`, hed)
            .then(res =>  res.text() 
                        .then(json => {          
                           // logger.log("Response = " + JSON.stringify(res.getHeaders()))              
                            const raw = JSON.stringify({
                                    "request": 
                                    {
                                        "timestamp": date,
                                        "originalClientIp": request.getHeader('true-client-ip')[0],
                                        "method": request.method,
                                        "uri": request.url,
                                        "httpVersion": "1.1",
                                        "headers": encodeHeaders(request.getHeaders()),
                                        "body": base64(_utf8_encode(hed.body))
                                        
                                    },
                                    "response": 
                                    {
                                        "timestamp": date,
                                        "httpVersion": "1.1",
                                        "statusCode": res.status.toString(),
                                        "headers": encodeHeaders(res.getHeaders()),
                                        "body": base64(_utf8_encode(json))
                                    },
                                    "props":
                                    {
                                        "uuid": UUID,
                                        "version": "1.0.0",
                                        "platform": "Akamai",
                                        "labels": {
                                        "env":  ENV,
                                        "region":  REGION
                                        }
                                        
                                    }
                                 });
                                const requestOptions = {
                                    method: 'POST',
                                    headers:  
                                        {
                                        "Authorization": Authorization,
                                        "Content-Type": "application/json",
                                        "Accept": "*/*",
                                        "Cache-Control": "no-cache",
                                        "Connection": "keep-alive"
                                       },
                                  body: raw,
                                    redirect: 'follow'
                                };   
                           if (debug == 'yes')
                           {
                            return httpRequest(`https://${request.host}/fakepath/saltsec/v1/http/exchange`,requestOptions )
                               .then(res1 => res1.text()
                               .then(json1 => {logger.log("res: "  + json1)}
                              )
                             )
                           }
                           else
                           {
                            httpRequest(`https://${request.host}/fakepath/saltsec/v1/http/exchange`,requestOptions )
                            return createResponse(
                                res.status,
                                res.headers,
                                JSON.stringify(json)
                           );
                           }
                        })

            )
            .catch(error => {
               logger.log('Error ', error.toString())
               return createResponse(400, {}, error.toString());
            })
}


var _utf8_encode = function (string) {
  string = string.replace(/\r\n/g,"\n");
  var utftext = "";
  for (var n = 0; n < string.length; n++) {
      var c = string.charCodeAt(n);
      if (c < 128) {
         utftext += String.fromCharCode(c);
      }
      else if((c > 127) && (c < 2048)) {
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






var base64 = function(input) {
    var result = '', binData, i;
    var base64Alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/='.split(''); // Base is 65 in fact :-)
    if (typeof input === 'string') for (i = 0, input = input.split(''); i < input.length; i++) input[i] = input[i].charCodeAt(0);
    // Extreme optimization. Something like black magic.
    // Risk of breaking the brain :-)
    for (i = 0; i < input.length; i += 3) {
        // Warning, bitwise operations! :-)
        // Grabbing three bytes (octets in binary):
        binData = (input[i] & 0xFF) << 16 |     // FF.00.00
                  (input[i + 1] & 0xFF) << 8 |  // 00.FF.00
                  (input[i + 2] & 0xFF);        // 00.00.FF
        // And converting them to four base64 "sixtets" (letters):
        result += base64Alphabet[(binData & 0xFC0000) >>> 18] +                   //11111100.00000000.00000000 = 0xFC0000 = 16515072
                  base64Alphabet[(binData & 0x03F000) >>> 12] +                   //00000011.11110000.00000000 = 0x03F000 = 258048
                  base64Alphabet[( i + 3 >= input.length && (input.length << 1) % 3 === 2 ? 64 :
                                     (binData & 0x000FC0) >>> 6 )] +              //00000000.00001111.11000000 = 0x000FC0 = 4032
                  base64Alphabet[( i + 3 >= input.length && (input.length << 1) % 3 ? 64 :
                                  binData & 0x00003F )];                          //00000000.00000000.00111111 = 0x00003F = 63
                  // If we haven't last byte, or two (for complete three octets),
                  // we place '=' [61] letter (or two) at the end.
    }
    return result;
} // base64
  
  
  function encodeHeaders(headers) {
    const objEntries = Object.entries(headers).map(([key, value]) => `${key}: ${value}`);
   const mapToArray = Array.from(objEntries.values());
    return mapToArray;
}





  export { responseProvider }