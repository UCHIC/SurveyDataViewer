#Survey Data Viewer#

The Survey Data Viewer provides visualization of the results of social science surveys. The code is generalizable for multiple surveys consisting of different questions. For each survey, the Survey Data Viewer requires 1. a data file and 2. a corresponding codebook. Follow the framework described here to make results compatible with the Viewer.

##Survey Data File##

The Data File is a .csv file with each field (column) corresponding to question numbers and each line (row) corresponding to a survey respondant. The header should be a single line. The response values should all be numeric. If free text responses are permitted in the survey, they should be edited and given a number that corresponds to 'Other'. 

##Survey Codebook##

The codebook is a .csv file that provides the interpretation of the numeric codes in the data file. A template is provided to give guidance on the structure of this file (link), and is described below.

###'Variable' Column###

The 'Variable' column contains the variables or questions of interest for inclusion in the Survey Data Viewer. The values in this column should correspond to the names of the fields in the Data File. Variables can have any title or label, but only those that begin with a 'Q' will be interpreted as questions for display in the Survey Data Viewer (e.g., Q1, Q7, Q10, etc.). Other variables may be incuded for their use to disaggregate data based on demographics or another type of identifier (e.g., City, Venue, Investigator) without using them as a question for display. The 'Features' column is used to specify demographic variables.

For grouped or nested questions, each subquestion should have its own row. As shown in the template, these questions retain the same number and can be differentiated with letters (e.g., Q2a, Q2b, etc.).

###'VariableLabel' Column###

The 'VariableLabel' column contains the title for each question and corresponds to the text that will be displayed for that variable in the Survey Data Viewer. For example, 'Level of Concern', 'Age', 'Own or Rent Home'. For grouped questions, this is the overall question/variable label and will be repeated as there is an entry corresponding to each subquestion.

###'SubVariableLable' Column###

This column contains the labels for any subvariables in nested questions and corresponds to the text that will be displayed for that subquestion. It should be left blank for questions that do not include subquestions. For example, for the grouped question 'Level of Concern', the subquestions might be 'Flooding', 'Air Pollution', 'Poor Water Quality', etc.

###'ValueLabels' Column###

The 'ValueLabels' column enumerates the range of numeric responses to a question and their corresponding text labels. This column provides the interpretation for all of the response values in the data file. The '=' is used to associate a numeric code with the text label, and a ';' is used to separate each possible response. All repsonses may be listed or alternatively, only the minimum and maximum numeric values. For example, '1= Not at all Concerned; 5= Very Concerned'. In this case, 2, 3, and 4 are possible responses, but do not have labels. The Survey Data Viewer will interpret that integer responses between 1 and 5 should be used and will not include labels for 2, 3, and 4.

###'Features' Column###

The 'Features' column permits the assignment of Survey Data Viewer features to appropriate questions, which determines how responses for each question will be visualized, including color scheme. If a question does not include a feature flag to specify color scheme (i.e., bidirectional or unidimensional), a color scheme will be assigned randomly and it will only be displayed in percentage view.   

Currently implemented features are:

- *isDemographic:* The variable will be used as a demographic variable by which responses can be disaggregated. The variable will be select-able from the demographic variables dropdown.

*Note that multiple feature flags may be assigned to a question separated by a ';'. With the currently implemented features, multiple feature flags should only occur when the demographic feature flag is desired along with another.*

- *bidirectional:* The variable consists of responses in two directions with central neutrality. In addition to the default percentage view, questions with this designation will be displayed on both the heat map and the mean data views. For all views, the color scheme consists of two colors to indicate positive and negative with a neutral color for the central response. For example: a bidirectional question might have ValueLabels of '1 = Very Bad; 3 = Neither Good Nor Bad; 5 = Very Good'.
- *unidimensional:* The variable consists of responses that represent degree. In addition to the default percentage view, questions with this designation will be displayed on both the heat map and the mean data views. For all views, the color scheme consists of a single color with intensity increasing for numeric responses from low to high. For example, a unidimensional question might have ValueLabels of '1 = Not at all Concerned; 5 = Very Concerned'.

*Note that a question can be either bidirectional or unidimensional (but not both).*

- *spatial*: The Survey Data Viewer looks for a single question with the 'spatial' flag. This flag corresponds to the field of interest in the shapefile for producing a heat map and should only be used once. If there is no spatial flag, the heat map view is not implemented for the survey. *Note that the heat map is currently only available for zip codes of Utah, so the 'Zip Code' question should have the 'spatial' feature flag. In the future, we will implement the functionality for the user to provide shapefiles with custom boundaries.* 

		
