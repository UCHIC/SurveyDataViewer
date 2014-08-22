from django.views.generic import ListView, DetailView

from surveyinterface.models import Survey

# Create your views here.


class HomeView(ListView):
    model = Survey
    template_name = "surveyinterface/home.html"


class SurveyView(DetailView):
    model = Survey
    template_name = "surveyinterface/survey.html"