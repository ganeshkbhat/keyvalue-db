const http = require('http');
const assert = require('assert');
const sinon = require('sinon');
// We assume 'chai' is available in the testing environment.
const { expect } = require('chai');

const {
    makePostRequest,
    assertDeepEqual,
    deepCompare
} = require("../test/post.functions.js")



// --- 3. Mocha Test Suite ---
describe('API Sequence Testing: Payloads and Expected Responses', () => {
    let allTestScenarios = [
        // // handled - dump  
        // "./payloads.dump.json",
        // // handled -    (NOT WORKING, Error)
        // "./payloads.dumpkey.json", 
        // // handled -    (NOT WORKING, Error)
        // "./payloads.dumpkeys.json",
        // // handled - init
        // "./payloads.init.json",
        // // handled - load
        // "./payloads.load.json",
        // // handled - get 
        // "./payloads.get.json",
        // // handled - delete 
        // "./payloads.delete.json", 
        // // handled - deleteKey or delete 
        // "./payloads.delete.one.json",
        // // handled - deleteKey or delete
        // "./payloads.delete.two.json",
        // // handled - deletekeys 
        // "./payloads.deletekeys.json",
        // // handled - remove 
        // "./payloads.remove.json",
        // // handled - read  (NOT WORKING, Error)
        "./payloads.read.json",
        // // handled - create  (NOT WORKING, Error)
        // "./payloads.create.json",
        // // handled -  set  (NOT WORKING, Error)
        // "./payloads.set.json",
        // // handled -  
        // "./payloads.update.json",
        // // handled - 
        // "./payloads.search.json",
        // // handled - 
        // "./payloads.searchkeyvalue.json",
        // // handled - 
        // "./payloads.searchvalue.json",
    ]
    allTestScenarios.forEach(scenario => {
        var testSequenceData = require(scenario)
        // Get all test keys in order to maintain execution sequence
        var testKeys = Object.keys(testSequenceData);

        // Use an asynchronous loop to execute tests sequentially
        for (const key of testKeys) {
            const testCase = testSequenceData[key];

            // Create a separate 'it' block for each test case
            it(`Case ${key}: ${testCase.payload.event} ${testCase.description}`, async () => {
                const host = 'localhost'; // A public API for testing
                const port = 7000;
                const payload = testCase.payload;
                const expected = JSON.parse(JSON.stringify(testCase.response));



                // --- New: Custom options for the request ---
                const customOptions = {
                    timeout: 5000, // Example: Set a 5 second timeout
                    headers: {
                        // 'X-Custom-Auth': 'Bearer 12345' // Example: Add a custom header
                    }
                };

                // 1. Send the payload using the (mocked) post function
                const actualResponse = await makePostRequest(host, port, '/', testSequenceData[key]["payload"], customOptions);
                const response = JSON.parse(actualResponse)
                // // 2. Assert that the actual response deeply matches the expected response object
                // // Chai's 'deep.equal' performs a recursive comparison of the object properties.
                // //                

                // console.log(assertDeepEqual(response, testSequenceData[key].response))
                // console.log("deepCompare", deepCompare(JSON.stringify( response), JSON.stringify(testSequenceData[key].response)))
                // 
                let dc = deepCompare(JSON.stringify( response), JSON.stringify(testSequenceData[key].response))
                expect(JSON.parse(JSON.stringify(response))).to.deep.equal(JSON.parse(JSON.stringify(testSequenceData[key].response)),
                    `Expected response for Case ${key} to match, but objects were different. ${testSequenceData[key].description}`
                );
                assertDeepEqual(response, testSequenceData[key].response)
            });
        }
    })

});



// runExample(); // Uncomment this line to run the example function

module.exports = {
    makePostRequest
};

// If you run this file directly via `node post_request.js`, the example will execute.
if (require.main === module) {
    runExample();
}
