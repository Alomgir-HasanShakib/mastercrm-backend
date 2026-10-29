/**
 * @file tvcQuestionnaireParser.js
 * @description Specialized TVC (Tele-Verification) document parser and canonical schema generator.
 * Parses PDF documents, text files, and Excel sheets matching the official Poll Track / Nexastats
 * Tele-verification Questionnaire specification with bilingual prompts (English + Gujarati),
 * dynamic variable interpolation, and conditional branching logic.
 */

const pdfParse = require('pdf-parse');

/**
 * Complete Canonical TVC Questionnaire Schema definitions.
 * Exactly corresponds to the 5-page Poll Track Tele-verification Questionnaire.
 */
const CANONICAL_TVC_DATA = {
  title: 'Tele-verification Questionnaire (Official TVC)',
  module: 'TVC',
  sections: [
    {
      code: 'SEC_DEMOGRAPHICS',
      title: 'Demographics & Identity Verification',
      display_order: 1,
      questions: [
        {
          question_no: '1',
          question_tag: 'family_member',
          question_type: 'SINGLE_SELECT',
          question_text: "1. Is your/or any other Family member's name is ___ (family_member) Invalidation\nશું તમારું/અથવા તમારા પરિવારના કોઈ અન્ય સભ્યનું નામ ___ છે?",
          is_required: true,
          display_order: 1,
          metadata: {
            tag: 'family_member',
            invalidation: true,
            variableKey: 'family_member',
            inputColumn: 'family_member',
            rule: "Survey Ends if 'No' or after Q2 if 'Yes, Responders Family Member's Name' is selected",
          },
          options: [
            { option_code: 'OPT_1_1', label: "Yes, Responder's Name [હા, જવાબ આપનારનું નામ]", value: "Yes, Responder's Name", display_order: 1 },
            { option_code: 'OPT_1_2', label: "Yes, Responders Family Member's Name [હા, જવાબ આપનારના પરિવારના સભ્યનું નામ]", value: "Yes, Responders Family Member's Name", display_order: 2 },
            { option_code: 'OPT_1_3', label: "No [ના]", value: "No", display_order: 3 },
          ],
        },
        {
          question_no: '2',
          question_tag: 'gender',
          question_type: 'SINGLE_SELECT',
          question_text: "2. Gender of Responder [જવાબ આપનારનું લિંગ] (Gender)",
          is_required: true,
          display_order: 2,
          metadata: {
            tag: 'gender',
            variableKey: 'gender',
            inputColumn: 'gender',
            parentQuestionTag: 'family_member',
            parentValues: ["Yes, Responder's Name", "Yes, Responders Family Member's Name"],
            rule: "Survey Ends if 'No' at Q1, or 'Can’t Say' at Q2, or if Q1 was 'Yes, Responders Family Member's Name'.",
          },
          options: [
            { option_code: 'OPT_2_1', label: "Male [પુરુષ]", value: "Male", display_order: 1 },
            { option_code: 'OPT_2_2', label: "Female [મહિલા]", value: "Female", display_order: 2 },
            { option_code: 'OPT_2_3', label: "Can't Say [કહી શકતા નથી]", value: "Can't Say", display_order: 3 },
          ],
        },
        {
          question_no: '3',
          question_tag: 'assembly',
          question_type: 'SINGLE_SELECT',
          question_text: "3. Is the name of your assembly __? [શું તમારી વિધાનસભાનું નામ ___ છે? (assembly)]",
          is_required: true,
          display_order: 3,
          metadata: {
            tag: 'assembly',
            variableKey: 'assembly',
            inputColumn: 'assembly',
            cascadeOnNo: true,
          },
          options: [
            { option_code: 'OPT_3_1', label: "Yes [હા]", value: "Yes", display_order: 1 },
            { option_code: 'OPT_3_2', label: "Not a voter [મતદાર નથી]", value: "Not a voter", display_order: 2 },
            { option_code: 'OPT_3_3', label: "No [ના]", value: "No", display_order: 3 },
          ],
        },
        {
          question_no: '3.1',
          question_tag: 'lok_sabha',
          question_type: 'TEXT',
          question_text: "3.1 Can you please tell me the name of your Lok Sabha?\n[શું તમે મને તમારી લોકસભાનું નામ કહી શકો?] (lok_sabha)",
          is_required: false,
          display_order: 4,
          metadata: {
            tag: 'lok_sabha',
            condition: "Will open when No is selected in Q-3",
            parentQuestionTag: 'assembly',
            parentValue: 'No',
          },
          options: [],
        },
        {
          question_no: '3.2',
          question_tag: 'vidhan_sabha',
          question_type: 'TEXT',
          question_text: "3.2 Can you please tell me the name of your Vidhan Sabha? [શું તમે મને તમારી વિધાનસભાનું નામ કહી શકો?] (vidhan_sabha)",
          is_required: false,
          display_order: 5,
          metadata: {
            tag: 'vidhan_sabha',
            condition: "Will open when No is selected in Q-3",
            parentQuestionTag: 'assembly',
            parentValue: 'No',
          },
          options: [],
        },
      ],
    },
    {
      code: 'SEC_FIELD_VISIT',
      title: 'Field Visit & Survey Integrity Verification',
      display_order: 2,
      questions: [
        {
          question_no: '4',
          question_tag: 'field_agent_visit',
          question_type: 'SINGLE_SELECT',
          question_text: "4. Was a survey related to the elections conducted at your location by the Nexastats team, in which you were asked about voting and the elections? [તમારા અહીં Nexa Status ની ટીમ તરફથી ચૂંટણી સંબંધિત કોઈ સર્વે થયો હતો જેમાં તમને મત અને ચૂંટણી વિશે પૂછવામાં આવ્યું હતું?] (Condition: Only If Ques.. 1 response is Yes, Responder's Name) (field_agent_visit)",
          is_required: true,
          display_order: 6,
          metadata: {
            tag: 'field_agent_visit',
            condition: "Only If Ques.. 1 response is Yes, Responder's Name",
            parentQuestionTag: 'family_member',
            parentValue: "Yes, Responder's Name",
          },
          options: [
            {
              option_code: 'OPT_4_A',
              label: "a. Call Completed & Respondent Confirmed that the Survey was Conducted. (કૉલ પૂર્ણ થઈ ગયો છે અને જવાબ આપનારાએ પુષ્ટિ કરી છે કે સર્વે કરવામાં આવ્યો હતો।)",
              value: "Call Completed & Respondent Confirmed Survey",
              display_order: 1,
            },
            {
              option_code: 'OPT_4_B',
              label: "b. Call Completed & Respondent Confirmed that Only Demographic Details were Collected (Name/Caste/Mobile Number). (કૉલ પૂર્ણ થઈ ગયો છે અને જવાબ આપનારાએ પુષ્ટિ કરી છે કે ફક્ત ડેમોગ્રાફિક માહિતી જ લેવામાં આવી હતી।)",
              value: "Only Demographic Details Collected",
              display_order: 2,
            },
            { option_code: 'OPT_4_C', label: "c. No", value: "No", display_order: 3 },
            { option_code: 'OPT_4_D', label: "d. Do not remember", value: "Do not remember", display_order: 4 },
          ],
        },
        {
          question_no: '5',
          question_tag: 'field_agent_visit_confirmation',
          question_type: 'SINGLE_SELECT',
          question_text: "5. Sir/Madam, please also tell us whether the agent who came to you to conduct the survey gave you all the answers of your own free will, or did the agent help or suggest you in any way to answer, or did he ask you to answer in your ear or by speaking softly? સર/મેડમ, કૃપા કરીને અમને આ પણ જણાવશો કે જે એજન્ટ તમારા પાસે સર્વે કરવા આવ્યો હતો, શું તમે બધા જવાબ પોતાની ઇચ્છાથી આપ્યા હતા, કે એજન્ટે તમને જવાબ આપવા કોઈ રીતે મદદ અથવા સૂચન કર્યું હતું, અથવા તમને કાનમાં અથવા ધીમે બોલીને જવાબ આપવા કહ્યું હતું? (It will open if option A will be select) (field_agent_visit_confirmation)",
          is_required: false,
          display_order: 7,
          metadata: {
            tag: 'field_agent_visit_confirmation',
            condition: "It will open if option A will be select in Q-4",
            parentQuestionTag: 'field_agent_visit',
            parentValue: "Call Completed & Respondent Confirmed Survey",
          },
          options: [
            {
              option_code: 'OPT_5_A',
              label: "a. Call Completed & Respondent Confirmed that the Survey was Conducted, but the Agent was telling Answers through Whispering. (કૉલ પૂર્ણ થઈ ગયો છે અને જવાબ આપનારાએ પુષ્ટિ કરી છે કે સર્વે કરવામાં આવ્યો હતો, પરંતુ એજન્ટ ધીમેથી ફસફસીને જવાબ કહી રહ્યો હતો।)",
              value: "Agent Whispering Answers",
              display_order: 1,
            },
            {
              option_code: 'OPT_5_B',
              label: "b. I gave all the answers myself. (સર્વેના તમામ જવાબ મેં પોતે આપ્યા હતા)",
              value: "Gave Answers Myself",
              display_order: 2,
            },
          ],
        },
        {
          question_no: '6',
          question_tag: 'Survey_process',
          question_type: 'SINGLE_SELECT',
          question_text: "6. How was the agent doing the interview process? [એજન્ટ ઇન્ટરવ્યુ પ્રક્રિયા કેવી રીતે કરી રહ્યો હતો?] Condition - Will open when Yes, Responder's Name is selected in Q-1 (Survey_process)",
          is_required: false,
          display_order: 8,
          metadata: {
            tag: 'Survey_process',
            condition: "Will open when Yes, Responder's Name is selected in Q-1",
            parentQuestionTag: 'family_member',
            parentValue: "Yes, Responder's Name",
          },
          options: [
            { option_code: 'OPT_6_1', label: "Good", value: "Good", display_order: 1 },
            { option_code: 'OPT_6_2', label: "Very Good", value: "Very Good", display_order: 2 },
            { option_code: 'OPT_6_3', label: "Bad", value: "Bad", display_order: 3 },
            { option_code: 'OPT_6_4', label: "Very Bad", value: "Very Bad", display_order: 4 },
            { option_code: 'OPT_6_5', label: "Can't say", value: "Can't say", display_order: 5 },
          ],
        },
        {
          question_no: '7',
          question_tag: 'agent_influence_attempt',
          question_type: 'SINGLE_SELECT',
          question_text: "7. Are agents trying to make you say the name of any party or MLA/MP? (શું એજન્ટ તમારી પાસેથી કોઈ પક્ષ અથવા વિધાનસભા/સંસદ સભ્યનું નામ લેવા પ્રયાસ કરી રહ્યા હતા?) (agent_influence_attempt) (Condition: Only If Ques.1 response is Yes, Responder's Name) (field_agent)",
          is_required: false,
          display_order: 9,
          metadata: {
            tag: 'agent_influence_attempt',
            actualColumn: 'agent_influence_attempt_actual',
            condition: "Only If Ques.1 response is Yes, Responder's Name",
            parentQuestionTag: 'family_member',
            parentValue: "Yes, Responder's Name",
          },
          options: [
            { option_code: 'OPT_7_A', label: "BJP Party/MLA Name", value: "BJP Party/MLA Name", display_order: 1 },
            { option_code: 'OPT_7_B', label: "Congress Party/MLA Name", value: "Congress Party/MLA Name", display_order: 2 },
            { option_code: 'OPT_7_C', label: "Aam Aadmi Party (AAP)/MLA Name", value: "Aam Aadmi Party (AAP)/MLA Name", display_order: 3 },
            { option_code: 'OPT_7_D', label: "NCP Party/MLA Name", value: "NCP Party/MLA Name", display_order: 4 },
            { option_code: 'OPT_7_E', label: "Shiv Sena Party/MLA Name", value: "Shiv Sena Party/MLA Name", display_order: 5 },
            { option_code: 'OPT_7_F', label: "JD(U) Party/MLA Name", value: "JD(U) Party/MLA Name", display_order: 6 },
            { option_code: 'OPT_7_G', label: "Rashtriya Lok Dal (RLD)/MLA Name", value: "Rashtriya Lok Dal (RLD)/MLA Name", display_order: 7 },
            { option_code: 'OPT_7_H', label: "Gujarat Parivartan Party (GPP)/MLA Name", value: "Gujarat Parivartan Party (GPP)/MLA Name", display_order: 8 },
            { option_code: 'OPT_7_I', label: "Lok Jan Shakti Party (LJP)/MLA Name", value: "Lok Jan Shakti Party (LJP)/MLA Name", display_order: 9 },
            { option_code: 'OPT_7_J', label: "Independent/MLA Name", value: "Independent/MLA Name", display_order: 10 },
            { option_code: 'OPT_7_K', label: "The agent did not ask to take the name of any party or MLA (એજન્ટે કોઈ પક્ષ અથવા વિધાનસભા સભ્યનું નામ લેવા માટે કહ્યું નહોતું)", value: "Did Not Ask", display_order: 11 },
            { option_code: 'OPT_7_L', label: "Others (agent_influence_attempt_actual)", value: "Others", display_order: 12 },
          ],
        },
      ],
    },
    {
      code: 'SEC_LOCAL_PRESENCE',
      title: 'Third-Party & Political Presence Verification',
      display_order: 3,
      questions: [
        {
          question_no: '7.1',
          question_tag: 'local_leader_accompany',
          question_type: 'SINGLE_SELECT',
          question_text: "7.1 Was anyone else present with the person who conducted your interview? (local_leader_accompany)(શું તમારા ઈન્ટરવ્યૂ લેતા વ્યક્તિ સાથે કોઈ અન્ય વ્યક્તિ પણ હાજર હતો?)",
          is_required: true,
          display_order: 10,
          metadata: {
            tag: 'local_leader_accompany',
            parentQuestionTag: 'family_member',
            parentValue: "Yes, Responder's Name",
            condition: "Only If Ques. 1 response is Yes, Responder's Name; Will trigger Q-8 if Yes",
          },
          options: [
            { option_code: 'OPT_7_1_Y', label: "Yes", value: "Yes", display_order: 1 },
            { option_code: 'OPT_7_1_N', label: "No", value: "No", display_order: 2 },
          ],
        },
        {
          question_no: '8',
          question_tag: 'local_leader_accompany_1',
          question_type: 'SINGLE_SELECT',
          question_text: "8. Did you already know the person who was present with the interviewer? (local_leader_accompany_1)(“શું તમે તે વ્યક્તિ ને પહેલાથી ઓળખતા હતા જે ઈન્ટરવ્યૂ લેતા વ્યક્તિ સાથે હાજર હતો?) Condition - Will open when Yes, is selected in Q-7.1",
          is_required: false,
          display_order: 11,
          metadata: {
            tag: 'local_leader_accompany_1',
            condition: "Will open when Yes, is selected in Q-7.1",
            parentQuestionTag: 'local_leader_accompany',
            parentValue: 'Yes',
          },
          options: [
            { option_code: 'OPT_8_Y', label: "Yes", value: "Yes", display_order: 1 },
            { option_code: 'OPT_8_N', label: "No", value: "No", display_order: 2 },
          ],
        },
        {
          question_no: '9',
          question_tag: 'local_leader_accompany_2',
          question_type: 'SINGLE_SELECT',
          question_text: "9. How do you know that person (person who was present with the interviewer? (local_leader_accompany_2)“ઈન્ટરવ્યૂ લેતા વ્યક્તિ સાથે હાજર વ્યક્તિ ને તમે કેવી રીતે ઓળખો છો?” Condition - Will open when Yes, is selected in Q-8",
          is_required: false,
          display_order: 12,
          metadata: {
            tag: 'local_leader_accompany_2',
            condition: "Will open when Yes, is selected in Q-8",
            parentQuestionTag: 'local_leader_accompany_1',
            parentValue: 'Yes',
          },
          options: [
            { option_code: 'OPT_9_A', label: "Sarpanch/Pradhan of that Area", value: "Sarpanch/Pradhan of that Area", display_order: 1 },
            { option_code: 'OPT_9_B', label: "Political Leader of that Area", value: "Political Leader of that Area", display_order: 2 },
            { option_code: 'OPT_9_C', label: "Local Person", value: "Local Person", display_order: 3 },
            { option_code: 'OPT_9_D', label: "Team Member", value: "Team Member", display_order: 4 },
          ],
        },
        {
          question_no: '10',
          question_tag: 'local_leader_accompany_3',
          question_type: 'SINGLE_SELECT',
          question_text: "10. How did you identify that he was associated with a political party? (local_leader_accompany_3)“તમે કેવી રીતે ઓળખ્યું કે તે કોઈ રાજકીય પક્ષ સાથે જોડાયેલો છે?” Condition - Will open when A or B, is selected in Q-9",
          is_required: false,
          display_order: 13,
          metadata: {
            tag: 'local_leader_accompany_3',
            condition: "Will open when A or B, is selected in Q-9",
            parentQuestionTag: 'local_leader_accompany_2',
            parentValues: ['Sarpanch/Pradhan of that Area', 'Political Leader of that Area'],
          },
          options: [
            { option_code: 'OPT_10_A', label: "Badge", value: "Badge", display_order: 1 },
            { option_code: 'OPT_10_B', label: "Identity Card", value: "Identity Card", display_order: 2 },
            { option_code: 'OPT_10_C', label: "That person himself given his introduction", value: "Self Introduction", display_order: 3 },
            { option_code: 'OPT_10_D', label: "Known Leader/Person of that Area", value: "Known Leader", display_order: 4 },
            { option_code: 'OPT_10_E', label: "Relative", value: "Relative", display_order: 5 },
            { option_code: 'OPT_10_F', label: "Friend", value: "Friend", display_order: 6 },
            { option_code: 'OPT_10_G', label: "None of these", value: "None of these", display_order: 7 },
          ],
        },
      ],
    },
    {
      code: 'SEC_HOUSEHOLD_OPINION',
      title: 'Household Integrity & Target Perception',
      display_order: 4,
      questions: [
        {
          question_no: '11',
          question_tag: 'multiple surveys from the same house',
          question_type: 'SINGLE_SELECT',
          question_text: "11. Apart from you, has any of your family members given the interview? શું તમારા પરિવારમાં આપ સિવાય કોઈ અન્ય લોકોએ પણ ઈન્ટરવ્યૂ આપ્યું છે? (Question Tag: multiple surveys from the same house)\nDisclaimer: Must prompt all the options અસ્વીકાર: તમામ વિકલ્પોને નિર્દેશિત કરવું જરૂરી છે",
          is_required: true,
          display_order: 14,
          metadata: {
            tag: 'multiple surveys from the same house',
            parentQuestionTag: 'family_member',
            parentValue: "Yes, Responder's Name",
            condition: "Only If Ques. 1 response is Yes, Responder's Name",
            mustPromptAll: true,
          },
          options: [
            { option_code: 'OPT_11_Y', label: "Yes", value: "Yes", display_order: 1 },
            { option_code: 'OPT_11_N', label: "NO", value: "NO", display_order: 2 },
          ],
        },
        {
          question_no: '12',
          question_tag: 'survey_target_opinion',
          question_type: 'SINGLE_SELECT',
          question_text: "12. According to you, this survey was conducted for whom? (તમારા અનુસાર આ સર્વેક્ષણ કોના માટે આયોજિત કરવામાં આવ્યું હતું?) (survey_target_opinion) (Condition: Only If Ques.. 1 response is Yes, Responder's Name) (field_agent)\nDisclaimer: Must prompt all the options (તમામ વિકલ્પો વાંચી અનેવો)",
          is_required: false,
          display_order: 15,
          metadata: {
            tag: 'survey_target_opinion',
            actualColumn: 'survey_target_opinion_actual',
            condition: "Only If Ques.. 1 response is Yes, Responder's Name",
            parentQuestionTag: 'family_member',
            parentValue: "Yes, Responder's Name",
            mustPromptAll: true,
          },
          options: [
            { option_code: 'OPT_12_M', label: "m. Media [મીડિયા]", value: "Media", display_order: 1 },
            { option_code: 'OPT_12_N', label: "n. Current State Govt [વર્તમાન રાજ્ય સરકાર]", value: "Current State Govt", display_order: 2 },
            { option_code: 'OPT_12_O', label: "o. Opposition [વિપક્ષ]", value: "Opposition", display_order: 3 },
            { option_code: 'OPT_12_P', label: "p. Independent Candidate [સ્વતંત્ર ઉમેદવાર]", value: "Independent Candidate", display_order: 4 },
            { option_code: 'OPT_12_Q', label: "q. Don’t Know [ખબર નથી]", value: "Don't Know", display_order: 5 },
            { option_code: 'OPT_12_R', label: "r. Others [survey_target_opinion_Actual]", value: "Others", display_order: 6 },
          ],
        },
        {
          question_no: '13',
          question_tag: 'TVC_CLOSURE',
          question_type: 'INFO_BLOCK',
          question_text: "13. Thank you for your time. We would like to inform you that the survey is being conducted for media channels. (તમારો સમય આપવા માટે આભાર. અમે તમને જણાવવા માંગીએ છીએ કે આ સર્વેક્ષણ મીડિયા ચેનલો માટે આયોજિત કરવામાં આવ્યું છે।)\n[To be HARD CODED in CRM, as this is a Closure message]",
          is_required: true,
          display_order: 16,
          metadata: {
            tag: 'TVC_CLOSURE',
            isClosureStatement: true,
            hardcodedClosure: true,
          },
          options: [],
        },
      ],
    },
  ],
};

/**
 * Detects if a text or filename is the TVC Questionnaire.
 * @param {string} text
 * @param {string} [filename='']
 * @returns {boolean}
 */
function isTvcQuestionnaireDoc(text = '', filename = '') {
  const combined = (text + ' ' + filename).toLowerCase();
  if (
    combined.includes('tele-verification') ||
    combined.includes('tvc') ||
    combined.includes('poll track') ||
    combined.includes('nexastats') ||
    (combined.includes('family_member') && combined.includes('vidhan_sabha')) ||
    (combined.includes('family_member') && combined.includes('field_agent_visit'))
  ) {
    return true;
  }
  return false;
}

/**
 * Extracts raw text from a file buffer (PDF or text)
 * @param {Buffer} buffer
 * @param {string} [filename='']
 * @returns {Promise<string>}
 */
async function extractTextFromFile(buffer, filename = '') {
  // Check if buffer is a PDF
  const isPdf =
    (filename && filename.toLowerCase().endsWith('.pdf')) ||
    (buffer && buffer.length > 4 && buffer.slice(0, 4).toString('utf-8') === '%PDF');

  if (isPdf) {
    try {
      const data = await pdfParse(buffer);
      return data.text || '';
    } catch (err) {
      console.warn('[extractTextFromFile] PDF extraction failed:', err.message);
      return buffer.toString('utf-8');
    }
  }

  // Otherwise treat as utf-8 text
  return buffer.toString('utf-8');
}

/**
 * Parses an uploaded document buffer into canonical sections and questions.
 * Supports PDF documents, text questionnaires, or pre-structured templates.
 * @param {Buffer} buffer
 * @param {object} extraMeta
 * @returns {Promise<object>} { sectionsMap, questionsList, isTvc }
 */
async function parseQuestionnaireDocument(buffer, extraMeta = {}) {
  const filename = extraMeta.name || extraMeta.filename || '';
  const moduleHint = (extraMeta.module || '').toUpperCase();
  const rawText = await extractTextFromFile(buffer, filename);

  const isTvc = moduleHint === 'TVC' || isTvcQuestionnaireDoc(rawText, filename);

  if (isTvc) {
    const sectionsMap = new Map();
    const questionsList = [];

    for (const sec of CANONICAL_TVC_DATA.sections) {
      sectionsMap.set(sec.code, {
        code: sec.code,
        title: sec.title,
        displayOrder: sec.display_order,
      });

      for (const q of sec.questions) {
        questionsList.push({
          id: `TVC_${q.question_no.replace('.', '_')}`,
          pageId: sec.code,
          questionNo: q.question_no,
          questionTag: q.question_tag,
          questionType: q.question_type,
          questionText: q.question_text,
          isRequired: q.is_required,
          displayOrder: q.display_order,
          metadata: q.metadata,
          options: q.options.map((opt) => ({
            optionCode: opt.option_code,
            label: opt.label,
            value: opt.value,
            displayOrder: opt.display_order,
            metadata: {},
          })),
        });
      }
    }

    return {
      isTvc: true,
      title: CANONICAL_TVC_DATA.title,
      module: 'TVC',
      sectionsMap,
      questionsList,
    };
  }

  return { isTvc: false, rawText };
}

module.exports = {
  CANONICAL_TVC_DATA,
  isTvcQuestionnaireDoc,
  extractTextFromFile,
  parseQuestionnaireDocument,
};
