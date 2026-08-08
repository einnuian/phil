from docling.document_converter import DocumentConverter, PdfFormatOption
from docling.datamodel.pipeline_options import PdfPipelineOptions
from docling.datamodel.base_models import InputFormat
from .config import DOCS_PATH
import os

def load_documents(docs_path=DOCS_PATH):
    """Build a list of paths of PDFs (per page), Word docs, and text files"""
    print(f'Loading documents from {docs_path}')

    if not os.path.isdir(docs_path):
        raise FileNotFoundError(f'The directory {docs_path} does not exist.')

    paths = []
    for root, dirnames, filenames in os.walk(docs_path):
        dirnames.sort()  # deterministic walk order
        for name in sorted(filenames):
            if name == ".DS_Store":
                continue # ignore .DS_Store files
            path = os.path.join(root, name)
            #name = os.path.splitext(name)[0].lower() # remove the file extension
            paths.append(path)

    return paths

def main():

    '''paths = load_documents()

    # Set up pipeline options
    pipeline_options = PdfPipelineOptions(do_table_structure=True)
    converter = DocumentConverter(
        format_options={InputFormat.PDF: PdfFormatOption(pipeline_options=pipeline_options)}
    )

    # Batch convert
    results = converter.convert_all(paths)

    # Export results
    for result in results:
        with open(f"md_output/{result.input.file.stem.lower()}.md", "w", encoding="utf-8") as f:
            f.write(result.document.export_to_markdown())'''

    print(DOCS_PATH)

if __name__ == '__main__':
    main()