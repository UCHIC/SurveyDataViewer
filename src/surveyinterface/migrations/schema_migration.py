# -*- coding: utf-8 -*-
from __future__ import unicode_literals

from django.db import models, migrations
import surveyinterface.models


class Migration(migrations.Migration):

    dependencies = [
    ]

    operations = [
        migrations.CreateModel(
            name='Survey',
            fields=[
                ('code', models.CharField(max_length=10, serialize=False, verbose_name=b'Survey Code', primary_key=True)),
                ('name', models.CharField(max_length=255, verbose_name=b'Survey Name')),
                ('description', models.CharField(max_length=512, verbose_name=b'Survey Description')),
                ('pdf', models.FileField(upload_to=surveyinterface.models.content_file_name, verbose_name=b'PDF File')),
                ('datafile', models.FileField(upload_to=surveyinterface.models.content_file_name, verbose_name=b'Data File')),
                ('metadatafile', models.FileField(upload_to=surveyinterface.models.content_file_name, verbose_name=b'Metadata File')),
                ('information', models.TextField(verbose_name=b'About Survey Text')),
            ],
        ),
    ]
