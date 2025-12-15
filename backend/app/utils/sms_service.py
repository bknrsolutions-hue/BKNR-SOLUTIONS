from twilio.rest import Client

ACCOUNT_SID = "your_twilio_sid"
AUTH_TOKEN = "your_token"
TWILIO_NUMBER = "+1xxxxxxxx"

client = Client(ACCOUNT_SID, AUTH_TOKEN)

def send_sms(mobile, otp):
    msg = f"Your BKNR ERP OTP is {otp}"
    client.messages.create(
        body=msg,
        from_=TWILIO_NUMBER,
        to="+91" + mobile
    )
