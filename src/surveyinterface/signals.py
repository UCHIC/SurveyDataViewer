import os

from django_cleanup.signals import cleanup_post_delete
from django.dispatch import receiver
from django.contrib import messages


@receiver(cleanup_post_delete)
def delete_folder(**kwargs):
    directory = os.path.join(kwargs['file'].storage.location, kwargs['file'].instance.code)
    if not os.path.isdir(directory):
        return

    if not os.listdir(directory):
        try:
            os.rmdir(directory)
        except OSError as ose:
            messages.add_message(request, messages.WARNING, 'The directory for this survey couldn\'t be deleted')
