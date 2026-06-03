import aiosmtplib
from email.message import EmailMessage

from app.core.config import get_settings


async def send_html_email(subject: str, recipients: list[str], html: str) -> None:
    settings = get_settings()
    recipients = [email for email in recipients if email]
    if not settings.smtp_host or not recipients:
        return
    message = EmailMessage()
    message["From"] = settings.smtp_from
    message["To"] = ", ".join(recipients)
    message["Subject"] = subject
    message.set_content("Open this message in an HTML-capable email client.")
    message.add_alternative(html, subtype="html")
    await aiosmtplib.send(
        message,
        hostname=settings.smtp_host,
        port=settings.smtp_port,
        username=settings.smtp_username or None,
        password=settings.smtp_password or None,
        start_tls=True,
    )
