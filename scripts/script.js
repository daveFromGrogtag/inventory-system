import { db, auth } from "../firebase/init.js"
import { setDoc, doc, query, collection, getDocs, updateDoc, getDoc, addDoc, Timestamp, where, orderBy } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { onAuthStateChanged} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js"; 

// - - - - - - - - - - - - //
// - - PAGE FUNCTIONS  - - //
// - - - - - - - - - - - - //

function getCurrentUserEmail() {
    return new Promise((resolve) => {
        onAuthStateChanged(auth, (user) => {
            resolve(user ? user.email : null);
        });
    });
}

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
        <p>Apple Ticket Number: ${jsonObject.appleTicketNumber} - Visit Id: ${jsonObject.visitId} - Location Id: ${jsonObject.locationId}

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
        // Need a new orderId
        let mainOrderId = jsonObject.appleTicketNumber + "-" + getCurrentDateWithRandomNumber();
        setDoc(doc(db, "orders", mainOrderId), {
            ...jsonObject,
            mainOrderId: mainOrderId,
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
                                let lowQtyTrigger = item.data().lowQtyTrigger?item.data().lowQtyTrigger:0
                                let currentAvailableQuantity = item.data().availableQuantity
                                let newAvailableQuantity = currentAvailableQuantity - value
                                if (newAvailableQuantity <= lowQtyTrigger) {
                                    createQuantityNotification(item.data().name, item.data().sku, newAvailableQuantity, lowQtyTrigger)
                                }
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
${order.data().notes ? "<b>Notes:</b> " + order.data().notes : ""}
<br>
<hr>
<b>Rep Email:</b> ${order.data().repEmail}<br>
<b>Employee Name:</b> ${order.data().employeeName}<br>
<b>Address:</b> ${order.data().address}<br>
<b>City:</b> ${order.data().city}<br>
<b>State:</b> ${order.data().state}<br>
<b>Zip Code:</b> ${order.data().zipCode}<br>
<b>Order Status:</b> ${order.data().orderStatus}<br>
${order.data().trackingNumber ? "<b>Tracking Number:</b> " + order.data().trackingNumber : ""}
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

                document.getElementById('calculateInvoicedButton').addEventListener('click', () => {
                    calculateInvoicedShippingCost()
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

function calculateInvoicedShippingCost() {
    let publishedRate = parseFloat(document.getElementById('publishedUpsRate').value)
    let discountedRate = publishedRate * 0.75
    document.getElementById('discountedUspRate').value = discountedRate.toFixed(2)
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
        updateDoc(doc(db, "inventory", jsonObject.sku), {
            "name": jsonObject.name
        }).then(() => {
            alert("item saved")
        })


        // setDoc(doc(db, "inventory", jsonObject.sku), {
        //     ...jsonObject
        // }).then(() => {
        //     alert("Item saved")
        // })
    } catch (error) {
        alert("Well, that didn't work")
        console.error(error)
    }
}

function populateOrdersPage() {
    console.log("Populating orders page...")
    const currentOrders = query(collection(db, "orders"), orderBy("createdOn", "desc"))
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

                    let orderRow = `<tr class="${order.data().orderStatus}">
                    <td>${order.data().appleTicketNumber}</td>
                <td>${order.data().visitId}</td>
                <td>${order.data().locationId}</td>
                <td>${order.data().repEmail}</td>
                <td>${order.data().orderStatus}</td>
                <td>${timeStampDate}</td>
                <td><a href="./view-order.html?id=${order.data().mainOrderId || order.data().appleTicketNumber}">Order</a></td>
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
    const currentOrders = query(collection(db, "orders"), orderBy("createdOn", "desc"))
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

                    let orderRow = `<tr class="${order.data().orderStatus}">
                    <td>${order.data().appleTicketNumber}</td>
                <td>${order.data().visitId}</td>
                <td>${order.data().locationId}</td>
                <td>${order.data().repEmail}</td>
                <td>${order.data().orderStatus}</td>
                <td>${timeStampDate}</td>
                <td>${order.data().publishedUpsRate || "-"}</td>
                <td>${order.data().discountedUspRate || "-"}</td>
                <td><a href="./view-order.html?id=${order.data().mainOrderId || order.data().appleTicketNumber}">Order</a> | <a href="./packing-list.html?id=${order.data().mainOrderId || order.data().appleTicketNumber}">Pack-List</a> | <a href="./order-shipped.html?id=${order.data().mainOrderId || order.data().appleTicketNumber}">Ship</a></td>
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
                <td>${item.data().lowQtyTrigger?item.data().lowQtyTrigger:"-"}</td>
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
    const reportType = document.getElementById("reportSelector").value

    // Order Report By Date
    if (reportType == "order-report") {
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
    // On Hand Quantities Report
    if (reportType == "on-hand-report") {
        try {
            console.log("On Hand Report Generating");
            generateInventoryCSV("inventory")

        } catch (error) {
            console.error(error)
        }
    }
    // Usage By Retailer 
    if (reportType == "by-retailer-report") {
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
            generateUsageByRetailerCSV("orders", startDate, endDate);
        } catch (error) {
            console.error(error)
        }
    }
    // Usage By Date
    if (reportType == "by-date-usage-report") {
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
            generateUsageByDateCSV("orders", startDate, endDate);
        } catch (error) {
            console.error(error)
        }
    }
    // Shipping Report
    if (reportType == "shipping-report") {
        try {
            console.log("Shipping Report Generating");
            generateShippingCSV("orders")
        } catch (error) {
            console.error(error)
        }
    }
    else {
        console.log("No report selected");

    }
}

function bulkUploader() {
    document.getElementById("bulkUploadSubmissionButton").addEventListener("click", (e) => {
        e.preventDefault()
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

    // document.getElementById("bulkUploadSubmissionButton").addEventListener("click", (e) => {
    //     e.preventDefault()
    //     let bulkUploadTextArea = document.getElementById("bulkUploadTextArea").value
    //     let rowSplit = bulkUploadTextArea.split(/\r?\n|\r|\n/g);
    //     rowSplit.forEach(row => {
    //         let cells = row.split(",")
    //         let appleTicketNumber = cells[1].trim()
    //         let address = cells[0].trim()
    //         let city = cells[2].trim()
    //         let createdOn = cells[3].trim()
    //         let employeeName = cells[4].trim()
    //         let locationId = cells[5].trim()
    //         let orderStatus = "complete"
    //         let repEmail = cells[7].trim()
    //         let retailer = cells[6].trim()
    //         let state = cells[9].trim()
    //         let visitId = cells[8].trim()
    //         let zipCode = cells[10].trim()

    //         setDoc(doc(db, "orders", appleTicketNumber), {
    //             appleTicketNumber: appleTicketNumber,
    //             address: address,
    //             city: city,
    //             createdOn: createdOn,
    //             employeeName: employeeName,
    //             items: [],
    //             locationId: locationId,
    //             orderStatus: orderStatus,
    //             repEmail: repEmail,
    //             retailer: retailer,
    //             state: state,
    //             visitId: visitId,
    //             zipCode: zipCode
    //         }).then(() => {
    //             console.log("Moving items");
    //         }).catch((error) => {
    //             console.error(error);

    //         })
    //     })

    // })

}

function populateEditInventoryPage() {
    console.log("Creating Edit Inventory Page...");
    console.log("Pulling items...")
    const currentInventory = query(collection(db, "inventory"))
    try {
        const inventoryTable = document.getElementById("edit-inventory-page-inventory-table")
        getDocs(currentInventory)
            .then((docs) => {
                let inventoryItemList = ""
                docs.forEach(item => {
                    let itemRow = `<tr>
                <td>${item.data().sku}</td>
                <td>${item.data().availableQuantity}</td>
                <td><input type="number" value=0 min=0 name="items[${item.data().sku}]"></td>
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

async function editInventoryValues() {
    const form = document.getElementById('myForm');
    const formData = new FormData(form);
    let emailBodyTable = "<tr><th>SKU</th><th>Added Qty</th><th>New Available Qty</th></tr>"

    const jsonObject = {
        items: {} // Initialize the nested object
    };

    formData.forEach((value, key) => {
        // Check if the key starts with 'items['
        if (key.startsWith('items[')) {
            const itemKey = key.replace('items[', '').replace(']', '');
            if (value != 0) {
                jsonObject.items[itemKey] = value; // Add to nested object
            }
        }
    });

    // console.log(jsonObject);

    // Collect promises from the loop
    const updatePromises = Object.entries(jsonObject.items).map(async ([key, value]) => {
        value = parseInt(value);
        if (value > 0) {
            try {
                const item = await getDoc(doc(db, "inventory", key));
                let currentAvailableQuantity = item.data().availableQuantity;
                let newAvailableQuantity = currentAvailableQuantity + value;
                emailBodyTable += `<tr><td>${key}</td><td>${value}</td><td>${newAvailableQuantity}</td></tr>`;
                await updateDoc(doc(db, "inventory", key), {
                    availableQuantity: newAvailableQuantity
                });
            } catch (error) {
                console.error(error);
            }
        }
    });

    // Wait for all promises to complete
    await Promise.all(updatePromises);

    const emailBody = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Vector Inventory Update</title>
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
        <h1>Inventory Quantity Updated</h1>
        <p>The inventory levels have been adjusted.</p>
        <table>${emailBodyTable}</table>
        <p class="footer">If you have any questions, please contact us at support@grogtag.com.</p>
        <p class="footer">Thank you!</p>
    </div>
    </body>
    </html>`
    createEmailNotification("dave@grogtag.com", "Vector Inventory Update", emailBody)
    alert('Item qty updated')
}

async function advancedEditInventoryValues() {
    const form = document.getElementById('myForm');
    const formData = new FormData(form);
    let emailBodyTable = "<tr><th>SKU</th><th>Added Qty</th><th>New Available Qty</th></tr>"

    const jsonObject = {
        items: {} // Initialize the nested object
    };

    formData.forEach((value, key) => {
        // Check if the key starts with 'items['
        if (key.startsWith('items[')) {
            const itemKey = key.replace('items[', '').replace(']', '');
            if (value != 0) {
                jsonObject.items[itemKey] = value; // Add to nested object
            }
        }
    });

    // console.log(jsonObject);

    // Collect promises from the loop
    const updatePromises = Object.entries(jsonObject.items).map(async ([key, value]) => {
        value = parseInt(value);
        if (value != 0) {
            try {
                const item = await getDoc(doc(db, "inventory", key));
                let currentAvailableQuantity = item.data().availableQuantity;
                let newAvailableQuantity = currentAvailableQuantity + value;
                emailBodyTable += `<tr><td>${key}</td><td>${value}</td><td>${newAvailableQuantity}</td></tr>`;
                await updateDoc(doc(db, "inventory", key), {
                    availableQuantity: newAvailableQuantity
                });
            } catch (error) {
                console.error(error);
            }
        }
    });

    // Wait for all promises to complete
    await Promise.all(updatePromises);

    const emailBody = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Vector Inventory Update</title>
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
        <h1>Inventory Quantity Updated</h1>
        <p>The inventory levels have been adjusted.</p>
        <table>${emailBodyTable}</table>
        <p class="footer">If you have any questions, please contact us at support@grogtag.com.</p>
        <p class="footer">Thank you!</p>
    </div>
    </body>
    </html>`
    // createEmailNotification("dave@grogtag.com", "Vector Inventory Update", emailBody)
    alert('Item qty updated, no email sent.')
}


// - - - - - - - - - - - - - //
// - - UTILITY FUNCTIONS - - //
// - - - - - - - - - - - - - //

function objectToCSV(obj) {
    // Get the list of item codes (keys from the first store)
    const itemCodes = Object.keys(Object.values(obj)[0]);

    // Prepare the CSV content
    let csvContent = "Retailer," + itemCodes.join(",") + "\n";  // First row: store names + item codes

    // Iterate over each store and collect item quantities
    for (const store in obj) {
        const row = [store];
        itemCodes.forEach(item => {
            row.push(obj[store][item] || 0);  // Add item quantity or 0 if undefined
        });
        csvContent += row.join(",") + "\n";  // Add row to CSV content
    }

    return csvContent;
}

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

async function createEmailNotification(recipientEmail, subjectLine, htmlMessage) {
    console.log("Creating Notification Email...");
    try {
        const userEmail = await getCurrentUserEmail()
        addDoc(collection(db, "mail"), {
            to: recipientEmail,
            cc: ["mariya@vectorholdinggroup.com", userEmail],
            bcc: "orders@grogtag.com",
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

function testEmailNotification() {
    console.log("Testing Notification Email...");
    try {
        addDoc(collection(db, "mail"), {
            to: "dave@grogtag.com",
            cc: "davebloisesquire@gmail.com",
            bcc: "orders@grogtag.com",
            message: {
                subject: "vector test",
                html: "VECTOR TEST"
            }
        }).then(() => {
            console.log("Test Message Sent");
        })

    } catch (error) {
        console.error(error);
    }
}

async function testUserNotification() {
    console.log("Testing Notification Email...");
    try {
        const userEmail = await getCurrentUserEmail()
        addDoc(collection(db, "mail"), {
            to: "david@pangeaeprint.com",
            cc: ["davebloisesquire@gmail.com", userEmail],
            message: {
                subject: "vector test 1",
                html: "VECTOR TEST"
            }
        }).then(() => {
            console.log("Test Message Sent");
        })

    } catch (error) {
        console.error(error);
    }
}

function createQuantityNotification(itemName, itemSku, currentInventory, lowQtyTrigger) {
    let subjectLine = `Item ${itemName} - ${itemSku} has fallen below reorder point.`
    let htmlMessage = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
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
        <h1>Item ${itemName} - ${itemSku} low inventory</h1>
        <p>Hello,</p>
        <p>Item ${itemName} - ${itemSku} has fallen below the reorder point of ${lowQtyTrigger}.</p>
        <p>There are currently ${currentInventory} available for order.
        
        <p class="footer">If you have any questions about your order, please contact us at support@grogtag.com.</p>
        <p class="footer">Thank you for ordering from us!</p>
    </div>
</body>
</html>`
    console.log("Creating Notification Email...");
    try {
        addDoc(collection(db, "mail"), {
            to: ["mariya@vectorholdinggroup.com", "srosen@actionlink.com"],
            bcc: "orders@grogtag.com",
            message: {
                subject: subjectLine,
                html: htmlMessage
            }
        }).then(() => {
            console.log("Low Inventory Message Sent");
        })

    } catch (error) {
        console.error(error);
    }
}


function getCurrentDateWithRandomNumber() {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0'); // Months are zero-based
    const day = String(today.getDate()).padStart(2, '0');
    const randomNumber = Math.floor(1000 + Math.random() * 9000); // Generates a 4-digit number
    return `${year}-${month}-${day}-${randomNumber}`;
}

function imageToDataUrl(inputContainer, previewContainer) {
    inputContainer.addEventListener("change", (event) => {
        const file = event.target.files[0]
        if (!file) return;

        const reader = new FileReader()

        reader.onload = (e) => {
            const dataURL = e.target.result

            const imgHtml = `<img src=${dataURL} style="max-width: 100px;"/>`
        }
    })
}


// - - - - - - - - - - - - - - //
// - - REPORTING FUNCTIONS - - //
// - - - - - - - - - - - - - - //

async function generateOrdersCSV(collectionName, startDate, endDate) {
    // Convert date inputs to Firestore Timestamps
    const startTimestamp = Timestamp.fromDate(startDate);
    const endTimestamp = Timestamp.fromDate(endDate);

    // Query Firestore for documents with timestamps within the range
    const querySnapshot = await getDocs(query(collection(db, collectionName), where("createdOn", ">=", startTimestamp), where("createdOn", "<=", endTimestamp)))
    // console.log(querySnapshot);

    // Check if documents were retrieved
    if (querySnapshot.empty) {
        alert("No documents found in the specified range.");
        return;
    }

    const staticColumns = ["mainOrderId", "appleTicketNumber", "visitId", "locationId", "retailer", "notes", "employeeName", "repEmail", "address", "city", "state", "zipCode", "createdOn", "shippedOn", "trackingNumber", "discountedUspRate", "publishedUpsRate", "orderStatus"]
    // Prepare dynamic columns and data
    let columns = new Set(); // To store unique column names
    let dataRows = [];

    // Iterate through each document to gather keys (fields) for columns
    // QUERY SNAP 1
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

        const dynamicColumns = Array.from(columns).filter(column => !staticColumns.includes(column)).sort();
        console.log(dynamicColumns);
    });


    // QUERY SNAP 2
    querySnapshot.forEach(doc => {
        const data = doc.data();
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
                        orderTimeStamp = `${month}/${day}/${year}`
                    }
                    fieldValue = orderTimeStamp
                    console.log(`${fieldValue} -- ${column}`);                
                } else {
                    fieldValue = data[column] || ''; // Default to empty string if not present
                }
                // console.log(`${fieldValue} -- ${column}`);                
                fieldValue = fieldValue.replace(/,/g, "")
                row.push(fieldValue);
            }
        });

        const dynamicColumns = Array.from(columns).filter(column => !staticColumns.includes(column)).sort();
        console.log(dynamicColumns);

        dynamicColumns.forEach(column => {
            if (column === 'items') {
                row.push(''); // If 'items' is not directly a field, leave it empty
            } else {
                let fieldValue = data[column] || data.items[column] || ''; // Default to empty string if not present
                fieldValue = fieldValue.replace(/,/g, "")
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

async function generateInventoryCSV(collectionName) {
    const querySnapshot = await getDocs(query(collection(db, collectionName)))
    console.log(querySnapshot);
    // Check if documents were retrieved
    if (querySnapshot.empty) {
        alert("No documents found in the specified range.");
        return;
    }
    let csvData = "name,sku,availableQuantity\n"
    querySnapshot.forEach(item => {
        csvData = csvData + `${item.data().name},${item.data().sku},${item.data().availableQuantity}\n`
    })
    console.log(csvData);

    const blob = new Blob([csvData], { type: 'text/csv' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `current_inventory_data.csv`;
    link.click();
}

async function generateUsageByRetailerCSV(collectionName, startDate, endDate) {
    // Convert date inputs to Firestore Timestamps
    const startTimestamp = Timestamp.fromDate(startDate);
    const endTimestamp = Timestamp.fromDate(endDate);

    // Query Firestore for documents with timestamps within the range
    const querySnapshot = await getDocs(query(collection(db, collectionName), where("createdOn", ">=", startTimestamp), where("createdOn", "<=", endTimestamp)))
    const inventorySnapshot = await getDocs(query(collection(db, "inventory")))
    // console.log(querySnapshot);
    let allItems = []
    let itemNames = {}
    inventorySnapshot.forEach(item => {
        allItems.push(item.data().sku)
        itemNames[item.data().sku] = item.data().name
    })

    let retailerList = [
        "t-mobile",
        "best-buy",
        "nebraska-furniture-mart",
        "us-cellular",
        "att",
        "army-air-force-exchange-store",
        "c-spire-wireless",
        "nexcom",
        "target",
        "usmc-exchange",
        "other"
    ]

    const retailerOrderData = retailerList.reduce((acc, key1) => {
        acc[key1] = {};  // Initialize the second-level object
        allItems.forEach(key2 => {
            acc[key1][key2] = 0;  // Set each second-level key to 0
        });
        return acc;
    }, {});

    // Check if documents were retrieved
    if (querySnapshot.empty) {
        alert("No documents found in the specified range.");
        return;
    }
    retailerOrderData["item-name"] = itemNames

    querySnapshot.forEach(order => {
        // const aidn = order.data().appleTicketNumber
        const orderRetailer = order.data().retailer || "other"
        const orderItems = order.data().items
        Object.keys(orderItems).forEach(itemKey => {
            // console.log(`aidn ${aidn} | ${orderRetailer} | ${itemKey} | ${orderItems[itemKey]} | ${retailerOrderData[orderRetailer][itemKey]}`);
            if (retailerOrderData[orderRetailer][itemKey] === undefined) {
                retailerOrderData[orderRetailer][itemKey] = 0
            }
            retailerOrderData[orderRetailer][itemKey] += parseInt(orderItems[itemKey])
        })
    })   
    const csvContent = objectToCSV(retailerOrderData)

    // Create a Blob and trigger download
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `retailer_usage_${startDate.toISOString()}_to_${endDate.toISOString()}.csv`;
    link.click();
}

async function generateUsageByDateCSV(collectionName, startDate, endDate) {
    // Convert date inputs to Firestore Timestamps
    const startTimestamp = Timestamp.fromDate(startDate);
    const endTimestamp = Timestamp.fromDate(endDate);

    // Query Firestore for documents with timestamps within the range
    const querySnapshot = await getDocs(query(collection(db, collectionName), where("createdOn", ">=", startTimestamp), where("createdOn", "<=", endTimestamp)))
    const inventorySnapshot = await getDocs(query(collection(db, "inventory")))
    // console.log(querySnapshot);
    let allItems = {}
    let itemNames = {}
    inventorySnapshot.forEach(item => {
        allItems[item.data().sku] = 0
        itemNames[item.data().sku] = item.data().name
    })
    
    
    console.log(allItems);

    // Check if documents were retrieved
    if (querySnapshot.empty) {
        alert("No documents found in the specified range.");
        return;
    }

    querySnapshot.forEach(order => {
        const orderItems = order.data().items
        Object.keys(orderItems).forEach(itemKey => {
            // console.log(`aidn ${aidn} | ${orderRetailer} | ${itemKey} | ${orderItems[itemKey]} | ${retailerOrderData[orderRetailer][itemKey]}`);
            if (allItems[itemKey] === undefined) {
                allItems[itemKey] = 0
            }
            allItems[itemKey] += parseInt(orderItems[itemKey])
        })
    })
    let csvContent = "sku,name,usage\n"
    Object.keys(allItems).forEach(itemKey => {
        csvContent += `${itemKey},${itemNames[itemKey]},${allItems[itemKey]}\n`
    })

    // Create a Blob and trigger download
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `part_usage_${startDate.toISOString()}_to_${endDate.toISOString()}.csv`;
    link.click();
}

async function generateShippingCSV(collectionName) {
        // Query Firestore for documents with timestamps within the range
        const querySnapshot = await getDocs(query(collection(db, collectionName), where("orderStatus", "==", "placed")))

        if (querySnapshot.empty) {
            alert("No documents found in the specified range.");
            return;
        }
        let csvHeader = "reference,serviceType,shipmentType,invoiceNumber,poNumber,senderContactName,senderCompany,senderContactNumber,senderLine1,senderPostcode,senderCity,senderState,senderCountry,recipientContactName,recipientContactNumber,recipientLine1,recipientPostcode,recipientCity,recipientState,recipientCountry,recipientResidential,numberOfPackages,packageWeight,weightUnits,length,width,height,packageType,currencyType\n"
        let csvContent = csvHeader

        querySnapshot.forEach(row => {
            const data = row.data()
            let csvRow = `${data.mainOrderId.replace(/,/g, "")},PRIORITY_OVERNIGHT,OUTBOUND,,SBF,Pangaea Print,Pangaea Print,9162028522,1479 Shore Street,95691,WEST SACRAMENTO,CA,US,${data.employeeName.replace(/,/g, "")},9162028522,${data.address.replace(/,/g, "")},"${data.zipCode}",${data.city.replace(/,/g, "")},${data.state},US,Y,1,1,LBS,9,7,3,YOUR_PACKAGING,USD\n`
            csvContent = csvContent + csvRow
        })
    
        // Create a Blob and trigger download
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `${collectionName}_data_shipping_report.csv`;
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

// - - - - - For Orders Admin Page
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

// - - - - - For Edit Inventory Page
if (classExists("edit-inventory-page")) {
    populateEditInventoryPage()
    document.getElementById("applyInventoryChangesButton").addEventListener("click", (e) => {
        e.preventDefault()
        editInventoryValues()
        // advancedEditInventoryValues()
    })
}

// - - - - - For Admin Page
if (classExists("admin-page")) {
    document.getElementById("email-test-btn").addEventListener("click", (e) => {
        e.preventDefault()
        // testEmailNotification()
        // testUserNotification()
        console.log("Email sent");
        
    })
}