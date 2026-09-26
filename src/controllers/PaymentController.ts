// Autor: Edson Vasconcelos | Diamond Runner 2026
// src/controllers/PaymentController.ts

import { Request, Response } from "express";
import Stripe from "stripe";
import { MercadoPagoConfig, Payment } from "mercadopago";
import { supabase } from "../services/supabase.js";
import { v4 as uuidv4 } from "uuid";


// =====================================
// STRIPE
// =====================================

const getStripe = () => {

  const key = process.env.STRIPE_SECRET_KEY;

  if (!key) {
    throw new Error(
      "STRIPE_SECRET_KEY não configurada"
    );
  }


  return new Stripe(key, {
    apiVersion:"2022-11-15",
  });

};



// =====================================
// MERCADO PAGO
// =====================================

const mpClient =
new MercadoPagoConfig({

accessToken:
process.env.MP_ACCESS_TOKEN || ""

});


const mpPayment =
new Payment(mpClient);



// =====================================
// PAYMENT INTENT STRIPE
// amount recebido em CENTAVOS
// =====================================

export const createPaymentIntent =
async(
req:Request,
res:Response
)=>{

try{


const {
amount,
currency="brl",
receipt_email
}=req.body;



const value =
Number(amount);



if(
!Number.isFinite(value) ||
value <=0
){

return res.status(400).json({

error:
"amount inválido"

});

}



const stripe =
getStripe();



const intent =
await stripe.paymentIntents.create({

amount:
Math.round(value),

currency,

receipt_email

});



return res.json({

clientSecret:
intent.client_secret

});



}catch(error:any){

console.error(
"PaymentIntent Error:",
error
);


return res.status(500).json({

error:
error.message

});


}

};




// =====================================
// CHECKOUT STRIPE
// amount recebido em REAIS
// Ex: 1599 -> 159900
// =====================================

export const createCheckoutSession =
async(
req:Request,
res:Response
)=>{


try{


const {

amount,

planName="BUILDER",

email,

fullName,

documentId,

phone,

sponsorUuid,

sponsorId,

sponsorName

}=req.body;



console.log(
"CHECKOUT BODY:",
req.body
);



const priceReais =
Number(
String(amount)
.replace(",",".")
);



if(
!Number.isFinite(priceReais) ||
priceReais <=0
){


return res.status(400).json({

status:"error",

message:
"amount inválido",

received:
amount

});


}



const stripe =
getStripe();



const cents =
Math.round(
priceReais * 100
);



console.log(
"STRIPE AMOUNT:",
cents
);



const session =
await stripe.checkout.sessions.create({

mode:"payment",


payment_method_types:[
"card"
],


customer_email:
email || undefined,


line_items:[

{

quantity:1,


price_data:{

currency:"brl",

unit_amount:cents,


product_data:{

name:
`Diamond Runner - ${planName}`,

description:
fullName
?
`Adesão ${planName} - ${fullName}`
:
`Adesão ${planName}`

}

}

}

],



success_url:

`diamondrunner://payment-success?email=${encodeURIComponent(
email || ""
)}`,



cancel_url:

"diamondrunner://payment-cancel",



metadata:{


planName:
String(planName),


email:
String(email||""),


fullName:
String(fullName||""),


documentId:
String(documentId||""),


phone:
String(phone||""),


sponsorUuid:
String(sponsorUuid||""),


sponsorId:
String(sponsorId||""),


sponsorName:
String(sponsorName||""),


amount:
String(priceReais)

}



});



return res.json({

status:"success",

url:
session.url,

sessionId:
session.id

});



}catch(error:any){


console.error(
"CHECKOUT ERROR:",
error
);



return res.status(500).json({

status:"error",

message:
error.message ||
"Falha checkout"

});


}


};




// =====================================
// CONFIRMA PAGAMENTO
// CRIA RUNNER
// =====================================

export const confirmPayment =
async(
req:Request,
res:Response
)=>{


try{


const {

fullName,

email,

sponsorId,

country="BR",

paymentData


}=req.body;



if(
!fullName ||
!email
){

return res.status(400).json({

status:"error",

message:
"Nome e email obrigatórios"

});

}



let approved =
true;



if(
paymentData &&
process.env.MP_ACCESS_TOKEN
){

const mp =
await mpPayment.create({

body:{

transaction_amount:
Number(
paymentData.transaction_amount
),

token:
paymentData.token,


description:
`Diamond Runner ${fullName}`,

installments:
1,


payment_method_id:
paymentData.payment_method_id,


payer:{
email
}

}

});


approved =
mp.status==="approved";


}



if(!approved){

return res.status(400).json({

status:"error",

message:
"Pagamento não aprovado"

});

}




const idDr =
`DR${Date.now()
.toString()
.slice(-6)}`;



const password =
uuidv4()
.replace(/-/g,"")
.substring(0,10);





const {
data:authData,
error:authError

}=await supabase.auth.admin.createUser({

email,

password,


email_confirm:true,


user_metadata:{

full_name:
fullName,

id_dr:
idDr

}


});



if(
authError ||
!authData?.user
){

throw authError ||
new Error(
"Erro criando usuário"
);

}




const {
error:profileError

}=await supabase
.from("profiles")
.insert({

id:
authData.user.id,


full_name:
fullName,


email,


id_dr:
idDr,


sponsor_id:
sponsorId || null,


country,


is_active:true,


level:1,


created_at:
new Date()
.toISOString()

});





if(profileError){

await supabase.auth.admin
.deleteUser(authData.user.id);


throw profileError;

}




return res.status(201).json({

status:"success",

id_dr:idDr,

message:
"Runner criado com sucesso"

});




}catch(error:any){


console.error(
"CONFIRM PAYMENT ERROR:",
error
);



return res.status(400).json({

status:"error",

message:
error.message

});


}


};