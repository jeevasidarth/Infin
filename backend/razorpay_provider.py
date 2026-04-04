import os
import razorpay
from dotenv import load_dotenv

load_dotenv()

key_id = os.environ.get("RAZORPAY_KEY_ID")
key_secret = os.environ.get("RAZORPAY_KEY_SECRET")

client = razorpay.Client(auth=(key_id, key_secret)) if key_id and key_secret else None

def create_razorpay_order(amount_inr: float, currency: str = "INR"):
    if not client:
        raise Exception("Razorpay client not initialized. Check your env variables.")
        
    # Ensure amount is in paise
    amount_in_paise = int(amount_inr * 100)
    
    data = {
        "amount": amount_in_paise,
        "currency": currency,
        "payment_capture": "1" # Auto-capture
    }
    
    order = client.order.create(data=data)
    return order
    
def verify_payment_signature(razorpay_order_id: str, razorpay_payment_id: str, razorpay_signature: str):
    if not client:
        raise Exception("Razorpay client not initialized.")
        
    params_dict = {
        'razorpay_order_id': razorpay_order_id,
        'razorpay_payment_id': razorpay_payment_id,
        'razorpay_signature': razorpay_signature
    }
    
    # Returns None if valid, raises SignatureVerificationError if invalid
    return client.utility.verify_payment_signature(params_dict)
