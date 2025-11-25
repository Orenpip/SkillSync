from flask import Flask, request, jsonify
import os
import tempfile
import json
import pandas as pd

app = Flask(__name__)

# Path to the notebook file in the repo
NOTEBOOK_PATH = os.path.join(os.path.dirname(__file__), 'notebooks', 'Untitled3.ipynb')
# Sample jobs CSV shipped with the repo
SAMPLE_JOBS_PATH = os.path.join(os.path.dirname(__file__), 'data', 'sample_jobs.csv')


def load_notebook_namespace(nb_path):
    """Load code cells from the notebook and exec them into a fresh namespace.
    We set __name__ so that `if __name__ == "__main__"` blocks do not run.
    Returns the namespace dict containing defined classes/functions.
    """
    import nbformat

    with open(nb_path, 'r', encoding='utf-8') as f:
        nb = nbformat.read(f, as_version=4)

    code_cells = [cell['source'] for cell in nb['cells'] if cell['cell_type'] == 'code']
    # Join lines; cell['source'] may be list or string
    full_code = '\n\n'.join(['\n'.join(src) if isinstance(src, list) else src for src in code_cells])

    ns = {'__name__': '__server__'}
    # Execute notebook code in namespace
    exec(compile(full_code, nb_path, 'exec'), ns)
    return ns


@app.route('/process-csv', methods=['POST'])
def process_csv():
    # Expect multipart form with file field 'file'
    if 'file' not in request.files:
        return jsonify({'error': 'No file field in request'}), 400

    f = request.files['file']
    if f.filename == '':
        return jsonify({'error': 'Empty filename'}), 400

    # Save uploaded CSV to temp file
    tmp_dir = tempfile.mkdtemp()
    tmp_csv = os.path.join(tmp_dir, 'uploaded_courses.csv')
    f.save(tmp_csv)

    try:
        ns = load_notebook_namespace(NOTEBOOK_PATH)
    except Exception as e:
        return jsonify({'error': 'Failed to load notebook', 'details': str(e)}), 500

    # Expect class CourseResumeKeywordExtractor to exist
    if 'CourseResumeKeywordExtractor' not in ns:
        return jsonify({'error': 'Required class not found in notebook namespace'}), 500

    try:
        ExtractorCls = ns['CourseResumeKeywordExtractor']
        extractor = ExtractorCls()

        # Run course+resume processing. The extension produces CSV with
        # headers: Course Name, Description, Resume Info
        results = extractor.process_courses_csv(
            tmp_csv,
            course_name_col='Course Name',
            course_desc_col='Description',
            resume_col='Resume Info'
        )
    except Exception as e:
        return jsonify({'error': 'Processing CSV failed', 'details': str(e)}), 500

    # If JobKeywordExtractor is available in notebook, run job matching using sample jobs
    top_matches = None
    try:
        if 'JobKeywordExtractor' in ns and os.path.exists(SAMPLE_JOBS_PATH):
            JobCls = ns['JobKeywordExtractor']
            job_extractor = JobCls()
            job_results = job_extractor.process_jobs_csv(
                SAMPLE_JOBS_PATH,
                job_name_col='job_name',
                job_desc_col='job_description',
                job_link_col='job_link'
            )
            top_matches = job_results.get('top_matches')
    except Exception as e:
        # Non-fatal: return extractor results and warn about jobs
        top_matches = None

    out = {
        'extraction': results,
        'top_matches': top_matches
    }

    return jsonify(out)


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    print('Starting server on http://localhost:%d' % port)
    app.run(host='127.0.0.1', port=port)
