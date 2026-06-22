const express = require("express");
const axios = require("axios");
const cors = require("cors");

const app = express();
app.use(express.json());
app.use(cors());

const BASE_URL = "https://sandbox.momodeveloper.mtn.com";

const API_USER = "YOUR_API_USER";
const API_KEY = "YOUR_API_KEY";
const SUB_KEY = "YOUR_SUBSCRIPTION_KEY";

// GET TOKEN
async function getToken(){
    let res = await axios.post(
        `${BASE_URL}/collection/token/`,
        {},
        {
            auth:{
                username:API_USER,
                password:API_KEY
            },
            headers:{
                "Ocp-Apim-Subscription-Key":SUB_KEY
            }
        }
    );
    return res.data.access_token;
}

// PAYMENT ENDPOINT
app.post("/pay", async (req,res)=>{

    try{

        let {phone,amount,orderId}=req.body;

        let token = await getToken();

        let payment = {
            amount:amount,
            currency:"UGX",
            externalId:orderId,
            payer:{
                partyIdType:"MSISDN",
                partyId:phone
            },
            payerMessage:"Javani Farms Order",
            payeeNote:"Agricultural goods"
        };

        await axios.post(
            `${BASE_URL}/collection/v1_0/requesttopay`,
            payment,
            {
                headers:{
                    "Authorization":"Bearer "+token,
                    "X-Reference-Id":orderId,
                    "X-Target-Environment":"sandbox",
                    "Ocp-Apim-Subscription-Key":SUB_KEY,
                    "Content-Type":"application/json"
                }
            }
        );

        res.json({success:true,message:"Payment sent"});

    }catch(err){
        res.status(500).json({error:"Payment failed"});
    }

});

const PORT = process.env.PORT || 3000;
app.listen(PORT, ()=>console.log("Server running"));
