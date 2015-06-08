from django.db import models


def content_file_name(instance, filename):
    return '/'.join([instance.code, filename])


class Survey(models.Model):
    code = models.CharField(verbose_name='Survey Code', max_length=10, primary_key=True)
    name = models.CharField(verbose_name='Survey Name', max_length=255)
    description = models.CharField(verbose_name='Survey Description', max_length=512)
    pdf = models.FileField(verbose_name='PDF File', upload_to=content_file_name)
    datafile = models.FileField(verbose_name='Data File', upload_to=content_file_name)
    metadatafile = models.FileField(verbose_name='Metadata File', upload_to=content_file_name)
    information = models.TextField(verbose_name='About Survey Text')

    def __str__(self):
        return ''.join([self.code, '_', self.name])

    def __unicode__(self):
        return unicode(''.join([self.code, '_', self.name])).encode()

    def __repr__(self):
        return ''.join([self.code, '_', self.name])