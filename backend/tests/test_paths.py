from sanjeevani import paths


def test_root_has_pyproject():
    assert (paths.ROOT / "pyproject.toml").exists()


def test_processed_dir_under_data():
    assert paths.DATA_PROCESSED.parent == paths.DATA
