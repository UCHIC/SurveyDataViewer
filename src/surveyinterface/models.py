from django.db import models
import os


def content_file_name(instance, filename):
    print dir(instance)
    return '/'.join([instance.code, filename])


# Create your models here.


class Survey(models.Model):
    code = models.CharField(verbose_name='Survey Code', max_length=10, primary_key=True)
    name = models.CharField(verbose_name='Survey Name', max_length=255)
    dateconducted = models.DateField(verbose_name='Date Conducted')
    dateadded = models.DateField(verbose_name='Date Added', auto_now=True)
    datafile = models.FileField(verbose_name='Data File', upload_to=content_file_name)
    metadatafile = models.FileField(verbose_name='Metadata File', upload_to=content_file_name)

    def __str__(self):
        return ''.join([self.code, '_', self.name])

    def __unicode__(self):
        return unicode(''.join([self.code, '_', self.name])).encode()

    def __repr__(self):
        return ''.join([self.code, '_', self.name])