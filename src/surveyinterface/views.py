from django.views.generic.list import ListView

from surveyinterface.models import Survey

# Create your views here.


class HomeView(ListView):
    model = Survey
    template_name = "surveyinterface/home.html"