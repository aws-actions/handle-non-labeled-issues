# Handle Non-labeled Issues

Issues created through the GitHub web interface can have templates applied to
them, which allows maintainers to set a label on new issue creation. But
there's no way to enforce that a label is applied to an issue when it is
created through the API or `gh` CLI. LLM agents especially prefer to use the
API to create issues, which can lead to unlabeled issues being created.

This action enforces that a label is applied to an issue when it is created. If
an issue is created without a label, this action will apply the default labels
you configure in the workflow, and optionally
comment on the issue to inform the user for next time.

## Usage

Use this example workflow file:

```yaml
name: Handle Non-labeled Issues
on:
  issues:
    types: [opened]
permissions:
  issues: write

jobs:
  handle_non_labeled_issues:
    runs-on: ubuntu-latest
    steps:
      - uses: aws-actions/handle-non-labeled-issues@v1
        with:
          labels: |
            needs-triage
            api-created
          message: >
            Hi! This issue was created via the API, so it didn't have a label
            and may be missing some information. Please use the issue template
            through the GitHub web interface next time to ensure that we have
            all the information we need to help you.
```

## License

This project is licensed under the Apache-2.0 License. See the
[LICENSE](LICENSE) file for details.

## Contributing

Please see [CONTRIBUTING](CONTRIBUTING.md) for guidelines on how to contribute.

## Reporting Issues

Please report any issues you find with this action here, on GitHub. If you are
reporting a security vulnerability, please see the
[security policy](SECURITY.md) for more information.
