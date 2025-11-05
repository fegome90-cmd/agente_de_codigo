
def validate_email(email):
    email_regex = r'^[\s@]+@[\s@]+\.[\s@]+$'
    import re
    return re.match(email_regex, email) is not None

def validate_phone(phone):
    phone_regex = r'^\+?[1-9]\d{1,14}$'
    import re
    return re.match(phone_regex, phone) is not None

def validate_age(age):
    return age >= 18 and age <= 120
    