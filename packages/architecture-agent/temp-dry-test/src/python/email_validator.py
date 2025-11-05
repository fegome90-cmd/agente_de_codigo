
def validate_email(email):
    email_regex = r'^[\s@]+@[\s@]+\.[\s@]+$'
    import re
    return re.match(email_regex, email) is not None

def check_domain(email):
    domain = email.split('@')[1] if '@' in email else None
    return domain is not None and len(domain) > 0

def format_email(email):
    return email.lower().strip()
    