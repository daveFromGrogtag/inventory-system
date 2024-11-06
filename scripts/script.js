import { db } from "../firebase/init.js"
import { setDoc, doc, query, collection, getDocs, updateDoc, getDoc, addDoc, Timestamp, where } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// - - - - - - - - - - - - //
// - - PAGE FUNCTIONS  - - //
// - - - - - - - - - - - - //

function populateInventoryOnOrderPage() {
    console.log("Pulling items...")
    const currentInventory = query(collection(db, "inventory"))
    try {
        const inventoryTable = document.getElementById("order-page-items-inventory-table")
        getDocs(currentInventory)
            .then((docs) => {
                let inventoryItemList = ""
                docs.forEach(item => {
                    let itemRow = `<tr>
                <td>${item.data().name}</td>
                <td>${item.data().sku}</td>
                <td>${item.data().availableQuantity}</td>
                <td><input type="number" value=0 min=0 max=${item.data().availableQuantity} name="items[${item.data().sku}]"></td>
                </tr>`
                    inventoryItemList += itemRow
                })
                inventoryTable.innerHTML = inventoryItemList
            }).catch((error) => {
                console.error(error);
            }).finally(() => {
                console.log("items pulled.");
            })
    } catch (error) {
        console.error(error)
    }
}

function previewOrder() {
    const form = document.getElementById('myForm');
    const formData = new FormData(form);
    const confirmationModal = document.getElementById('confirmationModal')
    const confirmationInfoContainer = document.getElementById('confirmationInfoContainer')
    confirmationModal.style.display = "block"
    let confirmationInfo = "";
    formData.forEach((value, key) => {
        if (key.includes("items[") && value == "0") {

        } else {
            confirmationInfo += `<p>${key} - ${value}</p>`
        }
    })
    // console.log(confirmationInfo);
    confirmationInfoContainer.innerHTML = confirmationInfo
}

function placeOrder() {
    const timeStampCurrent = new Date()
    console.log("Placing order...")
    try {
        const form = document.getElementById('myForm');
        const formData = new FormData(form);

        // Check that required fields are being filled out.
        const requiredInputs = form.querySelectorAll('input[required]')
        let missingRequiredFields = ""
        requiredInputs.forEach((requiredInput) => {
            if (!requiredInput.value.trim()) {
                missingRequiredFields += requiredInput.name + ", "
            }
        })
        // Halting and messaging on missing required fields
        if (missingRequiredFields !== "") {
            alert("Please fill out the following fields: " + missingRequiredFields)
            console.log("Order halted");
            return
        }

        // Converting form data to json data
        const jsonObject = {
            items: {} // Initialize the nested object
        };

        let emailHtmlItemList = ''

        formData.forEach((value, key) => {
            // Check if the key starts with 'items['
            if (key.startsWith('items[')) {
                const itemKey = key.replace('items[', '').replace(']', '');
                if (value > 0) {
                    jsonObject.items[itemKey] = value; // Add to nested object
                    emailHtmlItemList += `<tr><td>${itemKey}</td><td>${value}</td></tr>`
                }
                if (value < 0) {
                    alert("You've requested a negative amount of something. Please adjust this.")
                }
            } else {
                jsonObject[key] = value; // Add to the main object
            }
        });

        let emailConfirmationHtmlBody = `
        <!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Order Confirmation ${jsonObject.appleTicketNumber}</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            background-color: #f7f7f7;
            margin: 0;
            padding: 20px;
        }
        .container {
            background-color: #ffffff;
            border-radius: 5px;
            padding: 20px;
            box-shadow: 0 0 10px rgba(0,0,0,0.1);
        }
        h1 {
            color: #333;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 20px;
        }
        table, th, td {
            border: 1px solid #ddd;
        }
        th, td {
            padding: 10px;
            text-align: left;
        }
        th {
            background-color: #f2f2f2;
        }
        .footer {
            margin-top: 20px;
            font-size: 12px;
            color: #777;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>Order Confirmation - ${jsonObject.appleTicketNumber}</h1>
        <p>Dear ${jsonObject.employeeName},</p>
        <p>Thank you for your order! Here are the details of your order:</p>
        
        <h3>Order Information</h3>
        <p>Apple Ticket Number: ${jsonObject.appleTicketNumber} - Visit Id: ${jsonObject.visitId} - Location Id: ${locationId}

        <h3>Contact Information</h3>
        <p>Email: ${jsonObject.repEmail}</p>
        
        <h3>Shipping Address</h3>
        <p>${jsonObject.address}</p>
        <p>${jsonObject.city}, ${jsonObject.state} ${jsonObject.zipCode}</p>
        
        <h3>Order Details</h3>
        <table>
            <thead>
                <tr>
                    <th>Item</th>
                    <th>Quantity</th>
                </tr>
            </thead>
            <tbody>
                ${emailHtmlItemList}
            </tbody>
        </table>
        
        <p class="footer">If you have any questions about your order, please contact us at support@grogtag.com.</p>
        <p class="footer">Thank you for ordering from us!</p>
    </div>
</body>
</html>
        
        `

        // creates order in firebase
        // Apple Ticket Number is used as the order id
        setDoc(doc(db, "orders", jsonObject.appleTicketNumber), {
            ...jsonObject,
            orderStatus: "placed",
            createdOn: timeStampCurrent
        })
            .then(() => {
                // Sending Confirmation Email
                createEmailNotification(jsonObject.repEmail, `Order ${jsonObject.appleTicketNumber} has been placed.`, emailConfirmationHtmlBody)

                // then adjusts inventory quantities
                console.log("Adjusting staged values");
                Object.entries(jsonObject.items).forEach(([key, value]) => {
                    value = parseInt(value)
                    if (value > 0) {
                        getDoc(doc(db, "inventory", key))
                            .then((item) => {
                                let currentAvailableQuantity = item.data().availableQuantity
                                let newAvailableQuantity = currentAvailableQuantity - value
                                updateDoc(doc(db, "inventory", key), {
                                    availableQuantity: newAvailableQuantity
                                }).then(() => {
                                    // location.reload();
                                    document.getElementById("confirmationModal").innerHTML = `<div><h2>Order ${jsonObject.appleTicketNumber} has been placed.<br>Thank you!</h2></div>`
                                })
                            })
                            .catch((error) => {
                                console.error(error);
                            })
                    }
                })
            })
            .catch((error) => {
                console.error(error);
            })
    } catch (error) {
        console.error(error)
    }
}

function viewOrder() {
    let orderId = getQueryParamValue("id")
    console.log("Viewing order " + orderId + "...")
    try {
        getDoc(doc(db, "orders", orderId))
            .then((order) => {
                let orderHtml = `<b>Visit Id:</b> ${order.data().visitId}<br>
<b>Location Id:</b> ${order.data().locationId}<br>
<b>Apple Ticket Number:</b> ${order.data().appleTicketNumber}<br>
<br>
<b>Rep Email:</b> ${order.data().repEmail}<br>
<b>Employee Name:</b> ${order.data().employeeName}<br>
<b>Address:</b> ${order.data().address}<br>
<b>City:</b> ${order.data().city}<br>
<b>State:</b> ${order.data().state}<br>
<b>Zip Code:</b> ${order.data().zipCode}<br>
<br>
            `
                let itemList = ""
                Object.entries(order.data().items).forEach(([key, value]) => {
                    itemList += `<tr><td>${key}</td><td>${value}</td></tr>`
                })
                itemList = `<table><tr><th>Item SKU</th><th>Qty</th></tr>${itemList}</table>`

                document.getElementById("order-data").innerHTML = orderHtml + itemList
            })
    } catch (error) {
        console.error(error)
    }
}

function populateShippedOrder() {
    let orderId = getQueryParamValue("id")
    console.log("Viewing ship order page for " + orderId + "...")
    try {
        getDoc(doc(db, "orders", orderId))
            .then((order) => {
                let orderHtml = `<b>Visit Id:</b> ${order.data().visitId}<br>
<b>Location Id:</b> ${order.data().locationId}<br>
<b>Apple Ticket Number:</b> ${order.data().appleTicketNumber}<br>
<br>
<b>Rep Email:</b> ${order.data().repEmail}<br>
<b>Employee Name:</b> ${order.data().employeeName}<br>
<b>Address:</b> ${order.data().address}<br>
<b>City:</b> ${order.data().city}<br>
<b>State:</b> ${order.data().state}<br>
<b>Zip Code:</b> ${order.data().zipCode}<br>
<br>
            `
                let itemList = ""
                Object.entries(order.data().items).forEach(([key, value]) => {
                    itemList += `<tr><td>${key}</td><td>${value}</td></tr>`
                })
                itemList = `<table><tr><th>Item SKU</th><th>Qty</th></tr>${itemList}</table>`

                document.getElementById("order-data").innerHTML = orderHtml + itemList

                document.getElementById('orderShippedButton').addEventListener('click', () => {
                    shipOrder(orderId, order.data().repEmail, orderHtml + itemList)
                })
            })
    } catch (error) {
        console.error(error)
    }
}

function shipOrder(orderId, recipientEmail, emailBody) {
    const timeStampCurrent = new Date()
    let trackingNumber = document.getElementById('trackingNumber').value
    let publishedUpsRate = document.getElementById('publishedUpsRate').value
    let discountedUspRate = document.getElementById('discountedUspRate').value

    let shippingEmailNotificationHtml = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Shipping Confirmation ${orderId}</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            background-color: #f7f7f7;
            margin: 0;
            padding: 20px;
        }
        .container {
            background-color: #ffffff;
            border-radius: 5px;
            padding: 20px;
            box-shadow: 0 0 10px rgba(0,0,0,0.1);
        }
        h1 {
            color: #333;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 20px;
        }
        table, th, td {
            border: 1px solid #ddd;
        }
        th, td {
            padding: 10px;
            text-align: left;
        }
        th {
            background-color: #f2f2f2;
        }
        .footer {
            margin-top: 20px;
            font-size: 12px;
            color: #777;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>Shipping Confirmation - ${orderId}</h1>
        <p>Your order has been shipped! Here are the details of your shipment:</p>
        <p>Tracking Number: ${trackingNumber}</p>
    ${emailBody}
            <p class="footer">If you have any questions about your order, please contact us at [Support Email].</p>
        <p class="footer">Thank you for shopping with us!</p>
            </div>
</body>
</html>
    `

    try {
        updateDoc(doc(db, "orders", orderId), {
            trackingNumber: trackingNumber,
            publishedUpsRate: publishedUpsRate,
            discountedUspRate: discountedUspRate,
            orderStatus: "shipped",
            shippedOn: timeStampCurrent
        }).then(() => {
            createEmailNotification(recipientEmail, `Order ${orderId} has been shipped.`, shippingEmailNotificationHtml)
            alert("Order Marked as Shipped")
        })
    } catch (error) {
        console.error(error);
    }
}

function viewPackingList() {
    let orderId = getQueryParamValue("id")
    console.log("Viewing order " + orderId + "...")
    try {
        getDoc(doc(db, "orders", orderId))
            .then((order) => {
                let orderHtml = `<b>Apple Ticket Number:</b> ${order.data().appleTicketNumber}<br>
<b>Visit Id:</b> ${order.data().visitId}<br>
<b>Location Id:</b> ${order.data().locationId}<br>
<br>
<b>Rep Email:</b> ${order.data().repEmail}<br>
<b>Employee Name:</b> ${order.data().employeeName}<br>
<b>Address:</b> ${order.data().address}<br>
<b>City:</b> ${order.data().city}<br>
<b>State:</b> ${order.data().state}<br>
<b>Zip Code:</b> ${order.data().zipCode}<br>
<br>
            `
                let itemList = ""
                Object.entries(order.data().items).forEach(([key, value]) => {
                    itemList += `<tr><td>${key}</td><td>${value}</td></tr>`
                })
                itemList = `<table><tr><th>Item SKU</th><th>Qty</th></tr>${itemList}</table>`

                document.getElementById("packing-list-data").innerHTML = orderHtml + itemList
            })
    } catch (error) {
        console.error(error)
    }
}

function updateItem() {
    console.log("Updating item...")
    try {
        const form = document.getElementById('myForm');
        const formData = new FormData(form);
        const jsonObject = {};

        formData.forEach((value, key) => {
            if (key === "availableQuantity") {
                value = parseInt(value)
            }
            jsonObject[key] = value; // Add to the main object
        });

        // const jsonString = JSON.stringify(jsonObject);
        setDoc(doc(db, "inventory", jsonObject.sku), {
            ...jsonObject
        }).then(() => {
            alert("Item saved")
        })
    } catch (error) {
        console.error(error)
    }
}

function populateOrdersPage() {
    console.log("Populating orders page...")
    const currentOrders = query(collection(db, "orders"))
    try {
        const orderTable = document.getElementById("orders-page-order-table")
        getDocs(currentOrders)
            .then((docs) => {
                let orderList = ""
                docs.forEach(order => {
                    let orderTimeStamp = "N/A"
                    let day, month, year, timeStampDate
                    if (typeof order.data().createdOn == "object") {
                        orderTimeStamp = new Date(order.data().createdOn.seconds * 1000)
                        month = String(orderTimeStamp.getMonth() + 1)
                        day = String(orderTimeStamp.getDate())
                        year = String(orderTimeStamp.getFullYear())
                        timeStampDate = `${month}/${day}/${year}`
                    }

                    let orderRow = `<tr>
                    <td>${order.data().appleTicketNumber}</td>
                <td>${order.data().visitId}</td>
                <td>${order.data().locationId}</td>
                <td>${order.data().repEmail}</td>
                <td>${order.data().orderStatus}</td>
                <td>${timeStampDate}</td>
                <td><a href="./view-order.html?id=${order.data().appleTicketNumber}">Order</a></td>
                </tr>`
                    orderList += orderRow

                })
                orderTable.innerHTML = orderList
            })
    } catch (error) {
        console.error(error)
    }
}

function populateOrdersAdminPage() {
    console.log("Populating orders page...")
    const currentOrders = query(collection(db, "orders"))
    try {
        const orderTable = document.getElementById("orders-page-order-table")
        getDocs(currentOrders)
            .then((docs) => {
                let orderList = ""
                docs.forEach(order => {
                    let orderTimeStamp = "N/A"
                    let day, month, year, timeStampDate
                    if (typeof order.data().createdOn == "object") {
                        orderTimeStamp = new Date(order.data().createdOn.seconds * 1000)
                        month = String(orderTimeStamp.getMonth() + 1)
                        day = String(orderTimeStamp.getDate())
                        year = String(orderTimeStamp.getFullYear())
                        timeStampDate = `${month}/${day}/${year}`
                    }

                    let orderRow = `<tr>
                    <td>${order.data().appleTicketNumber}</td>
                <td>${order.data().visitId}</td>
                <td>${order.data().locationId}</td>
                <td>${order.data().repEmail}</td>
                <td>${order.data().orderStatus}</td>
                <td>${timeStampDate}</td>
                <td><a href="./view-order.html?id=${order.data().appleTicketNumber}">Order</a> | <a href="./packing-list.html?id=${order.data().appleTicketNumber}">Pack-List</a> | <a href="./order-shipped.html?id=${order.data().appleTicketNumber}">Ship</a></td>
                </tr>`
                    orderList += orderRow

                })
                orderTable.innerHTML = orderList
            })
    } catch (error) {
        console.error(error)
    }
}

function populateInventoryPage() {
    console.log("Populating inventory page...")
    const currentInventory = query(collection(db, "inventory"))
    try {
        const inventoryTable = document.getElementById("inventory-page-inventory-table")
        getDocs(currentInventory)
            .then((docs) => {
                let inventoryList = ""
                docs.forEach(item => {
                    let itemRow = `<tr>
                <td>${item.data().name}</td>
                <td>${item.data().sku}</td>
                <td>${item.data().location}</td>
                <td>${item.data().binNumber}</td>
                <td>${item.data().availableQuantity}</td>
                </tr>`
                    inventoryList += itemRow

                })
                inventoryTable.innerHTML = inventoryList
            })
    } catch (error) {
        console.error(error)
    }
}

function generateReport() {
    console.log("Generating reports...")
    try {
        // Get the start and end date values from the input fields
        const startDateInput = document.getElementById("startDate").value;
        const endDateInput = document.getElementById("endDate").value;

        if (!startDateInput || !endDateInput) {
            alert("Please select both start and end dates.");
            return;
        }

        // Convert input date strings to Date objects
        const startDate = new Date(startDateInput);
        const endDate = new Date(endDateInput);

        // Validate the date range
        if (startDate > endDate) {
            alert("Start date cannot be later than end date.");
            return;
        }

        // Call the generateCSV function with your Firestore collection name
        generateOrdersCSV("orders", startDate, endDate);
    } catch (error) {
        console.error(error)
    }
}

function bulkUploader() {
    document.getElementById("bulkUploadSubmissionButton").addEventListener("click", () => {
        let bulkUploadTextArea = document.getElementById("bulkUploadTextArea").value
        let rowSplit = bulkUploadTextArea.split(/\r?\n|\r|\n/g);
        rowSplit.forEach(row => {
            let cells = row.split(",")
            let sku = cells[0].trim()
            let name = cells[1].trim()
            let qty = parseInt(cells[2])
            setDoc(doc(db, "inventory", sku), {
                sku: sku,
                availableQuantity: qty,
                name: name,
                binNumber: "",
                location: ""
            }).then(() => {
                console.log(`sku: ${sku} | name: ${name} | qty: ${qty}`);
            }).catch((error) => {
                console.error(error);

            })
        })

    })
}

// - - - - - - - - - - - - - //
// - - UTILITY FUNCTIONS - - //
// - - - - - - - - - - - - - //

function getQueryParamValue(paramName) {
    let url = window.location.href;
    // Create a URL object
    let urlObj = new URL(url);
    // Use the URLSearchParams API to get the value of the parameter
    let params = new URLSearchParams(urlObj.search);
    // Return the value of the specified parameter
    return params.get(paramName);
}

function classExists(className) {
    return document.getElementsByClassName(className).length > 0;
}

function createEmailNotification(recipientEmail, subjectLine, htmlMessage) {
    console.log("Creating Notification Email...");
    try {
        addDoc(collection(db, "mail"), {
            to: recipientEmail,
            cc: "orders@grogtag.com",
            message: {
                subject: subjectLine,
                html: htmlMessage
            }
        }).then(() => {
            console.log("Message Sent");
        })

    } catch (error) {
        console.error(error);
    }
}

async function generateOrdersCSV(collectionName, startDate, endDate) {
    // Convert date inputs to Firestore Timestamps
    const startTimestamp = Timestamp.fromDate(startDate);
    const endTimestamp = Timestamp.fromDate(endDate);

    // Query Firestore for documents with timestamps within the range
    const querySnapshot = await getDocs(query(collection(db, collectionName), where("createdOn", ">=", startTimestamp), where("createdOn", "<=", endTimestamp)))
    console.log(querySnapshot);

    // Check if documents were retrieved
    if (querySnapshot.empty) {
        alert("No documents found in the specified range.");
        return;
    }

    const staticColumns = ["appleTicketNumber", "visitId", "locationId", "employeeName", "repEmail", "address", "city", "state", "zipCode", "createdOn", "orderStatus", "shippedOn", "trackingNumber", "publishedUpsRate", "discountedUspRate"]
    // Prepare dynamic columns and data
    let columns = new Set(); // To store unique column names
    let dataRows = [];

    // Iterate through each document to gather keys (fields) for columns
    querySnapshot.forEach(doc => {
        const data = doc.data();

        // Add top-level fields (orderNumber, address) to columns
        Object.keys(data).forEach(key => {
            if (key !== 'items') {
                columns.add(key);
            } else {
                // Add item keys to columns as separate headers
                Object.keys(data.items).forEach(itemKey => {
                    columns.add(itemKey);
                });
            }
        });

        // Prepare the row data
        const row = [];
        staticColumns.forEach(column => {
            if (column === 'items') {
                row.push(''); // If 'items' is not directly a field, leave it empty
            } else {
                let fieldValue
                if (column === 'createdOn' || column === 'shippedOn') {
                    let orderTimeStamp = "N/A"
                    let day, month, year, timeStampDate
                    if (typeof data[column] == "object") {
                        orderTimeStamp = new Date(data[column].seconds * 1000)
                        month = String(orderTimeStamp.getMonth() + 1)
                        day = String(orderTimeStamp.getDate())
                        year = String(orderTimeStamp.getFullYear())
                        timeStampDate = `${month}/${day}/${year}`
                    }
                    fieldValue = timeStampDate
                } else {
                    fieldValue = data[column] || ''; // Default to empty string if not present
                }
                row.push(fieldValue);
            }
        });

        const dynamicColumns = Array.from(columns).filter(column => !staticColumns.includes(column)).sort();
        dynamicColumns.forEach(column => {
            if (column === 'items') {
                row.push(''); // If 'items' is not directly a field, leave it empty
            } else {
                let fieldValue = data[column] || data.items[column] || ''; // Default to empty string if not present
                row.push(fieldValue);
            }
        })

        // Add the row to dataRows
        dataRows.push(row);
    });

    // Convert columns Set to an Array and generate the CSV content
    const columnArray = [...staticColumns, ...Array.from(columns).filter(column => !staticColumns.includes(column)).sort()];
    let csvContent = columnArray.join(",") + "\n"; // Add header row

    // Add data rows to CSV content
    dataRows.forEach(row => {
        csvContent += row.join(",") + "\n";
    });

    // Create a Blob and trigger download
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${collectionName}_data_${startDate.toISOString()}_to_${endDate.toISOString()}.csv`;
    link.click();
}

// - - - - - - - - - - - - - - - - //
// - - PAGE FUNCTION TRIGGERS  - - //
// - - - - - - - - - - - - - - - - //

// - - - - - For Order Page
if (classExists("index-page")) {
    populateInventoryOnOrderPage()
    document.getElementById('orderSubmissionButton').addEventListener('click', () => {
        placeOrder()
    })
    document.getElementById('orderPreviewButton').addEventListener('click', () => {
        // placeOrder()
        previewOrder()
    })
}

// - - - - - For Orders Page
if (classExists("orders-page")) {
    populateOrdersPage()
}

// - - - - - For Orders Page
if (classExists("orders-admin-page")) {
    populateOrdersAdminPage()
}

// - - - - - For Inventory Page
if (classExists("inventory-page")) {
    populateInventoryPage()
}

// - - - - - For Add Item Page
if (classExists("add-item-page")) {
    document.getElementById('addItemSubmissionButton').addEventListener('click', () => {
        updateItem()
    })
}

// - - - - - For View Order Page
if (classExists("view-orders-page")) {
    viewOrder()
}

// - - - - - For Packing List Page
if (classExists("packing-list-page")) {
    viewPackingList()
}

// - - - - - For Shipping Page
if (classExists("shipping-orders-page")) {
    populateShippedOrder()
}

// - - - - - For Bulk Upload Page
if (classExists("bulk-upload-page")) {
    bulkUploader()
}

// - - - - - For Reports Page
if (classExists("reports-page")) {
    document.getElementById("reportSubmitBtn").addEventListener("click", () => {
        console.log("running reports page");
        generateReport()
    })
}