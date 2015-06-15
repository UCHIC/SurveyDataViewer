import os

from django_cleanup.signals import cleanup_post_delete
from django.dispatch import receiver


@receiver(cleanup_post_delete)
def delete_folder(**kwargs):
    directory = os.path.join(kwargs['file'].storage.location, kwargs['file'].instance.code)
    if not os.listdir(directory):
        os.rmdir(directory)