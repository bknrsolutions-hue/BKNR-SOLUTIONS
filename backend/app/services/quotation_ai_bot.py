import logging

logger = logging.getLogger("BKNR_ERP.quotation_ai_bot")

def generate_ai_bot_reply(quotation_data: dict, incoming_msg: str) -> dict:
    """
    AI Chatbot Engine for Sales Price Quotations.
    Analyzes buyer inquiries/replies and drafts profitable, intelligent corporate responses.
    """
    msg_lower = (incoming_msg or "").lower()
    q_no = quotation_data.get("quotation_no", "QT")
    customer = quotation_data.get("customer_name", "Valued Customer")
    total_val = quotation_data.get("total_amount", 0)
    currency = quotation_data.get("currency", "USD")
    ship_date = quotation_data.get("shipment_date") or "Prompt"
    valid_until = quotation_data.get("valid_until") or "30 Days"
    company_name = quotation_data.get("company_name") or "BKNR ERP Solutions"
    items = quotation_data.get("items", [])

    # Analyze Intent
    is_discount = any(w in msg_lower for w in ["discount", "price", "cheaper", "lower", "rate", "reduce", "budget", "high"])
    is_delivery = any(w in msg_lower for w in ["shipment", "delivery", "dispatch", "time", "date", "lead time", "when", "schedule"])
    is_payment = any(w in msg_lower for w in ["payment", "lc", "tt", "terms", "credit", "deposit"])
    is_acceptance = any(w in msg_lower for w in ["accept", "confirm", "order", "agree", "proceed", "po", "proforma"])

    # Build Product Summary
    prod_lines = []
    for it in items:
        p_desc = it.get("item_name") or it.get("grade") or "Shrimp Item"
        qty = it.get("quantity_kg", 0)
        rate = it.get("bidding_price") or it.get("rate_per_kg", 0)
        prod_lines.append(f"• {p_desc}: {qty:,} Kg @ ${rate:.2f}/Kg")
    prod_summary = "\n".join(prod_lines) if prod_lines else "• Commercial Seafood Line Items"

    if is_acceptance:
        ai_analysis = f"🎯 Customer expressed intent to ACCEPT or PROCEED with Quotation #{q_no}."
        draft_response = f"""Dear {customer},

Thank you for confirming your acceptance of Price Quotation #{q_no}!

We are delighted to proceed with your commercial order for {currency} {total_val:,.2f}. 

Order Details Summary:
{prod_summary}
Shipment Date: {ship_date}

Our Commercial Sales Team is preparing the Proforma Invoice and Sales Contract for your formal execution. Please let us know if you need any additional documentation.

Best Regards,
Commercial Export Team
{company_name}"""

    elif is_discount:
        ai_analysis = f"💰 Customer requested PRICE REDUCTION or DISCOUNT on Quotation #{q_no}. Recommendation: Offer a standard 1.5% to 2% strategic volume discount if order quantity increases."
        draft_response = f"""Dear {customer},

Thank you for your response regarding Price Quotation #{q_no}.

Regarding your request for a price revision: Our quoted rates reflect current raw material market auctions and strict quality processing standards. However, to support your volume requirement, we can offer a special counter-offer rate for bulk shipment:

Current Quoted Offer: {currency} {total_val:,.2f}
Special Volume Counter-Offer: Open for mutual review upon order confirmation.

Please confirm if this meets your target budget so we can finalize the booking for shipment on {ship_date}.

Best Regards,
Commercial Sales & Pricing Desk
{company_name}"""

    elif is_delivery:
        ai_analysis = f"🚢 Customer inquired about SHIPMENT / DELIVERY SCHEDULE for Quotation #{q_no}. Scheduled Shipment Date: {ship_date}."
        draft_response = f"""Dear {customer},

Thank you for reaching out regarding the shipment timeline for Quotation #{q_no}.

We confirm that production planning and cold storage allocation are aligned for shipment on:
• Estimated Shipment Date: {ship_date}
• Quotation Validity: Valid until {valid_until}

Please confirm your booking at your earliest convenience so we can lock in container allocation with the ocean carrier.

Best Regards,
Logistics & Export Desk
{company_name}"""

    elif is_payment:
        ai_analysis = f"💳 Customer inquired about PAYMENT TERMS for Quotation #{q_no}."
        draft_response = f"""Dear {customer},

Thank you for your message regarding payment terms for Quotation #{q_no}.

Our standard export commercial payment terms are 100% Irrevocable LC at Sight or 30% Advance TT with balance against shipping documents. We are happy to evaluate customized payment terms based on your preferred bank.

Best Regards,
Finance & Export Desk
{company_name}"""

    else:
        ai_analysis = f"🤖 AI Assistant analyzed inquiry for Quotation #{q_no}. Draft response prepared covering product specs and commercial terms."
        draft_response = f"""Dear {customer},

Thank you for your email regarding Commercial Price Quotation #{q_no}.

We have reviewed your inquiry regarding our seafood offer ({currency} {total_val:,.2f}):
{prod_summary}

Shipment Date: {ship_date}
Quotation Validity: {valid_until}

Please feel free to contact us if you require any further technical specifications or sample inspections. We look forward to receiving your valued order.

Best Regards,
Commercial Sales & Export Team
{company_name}"""

    return {
        "success": True,
        "intent": "ACCEPTANCE" if is_acceptance else ("DISCOUNT" if is_discount else ("DELIVERY" if is_delivery else ("PAYMENT" if is_payment else "GENERAL"))),
        "ai_analysis": ai_analysis,
        "draft_response": draft_response
    }
