import React from 'react';
import { connect } from 'react-redux';
import PropTypes from 'prop-types';
import ReactDOM from 'react-dom';
import classNames from 'classnames';
import { injectIntl, FormattedMessage } from 'react-intl';
import { HotKeys } from 'react-hotkeys';
import { throttle } from 'lodash';
import isArray from 'lodash/isArray';
import { Icon, Checkbox, Form, Input, Select } from 'antd';
import Dropzone from 'react-dropzone';
import EditorToolbar from './EditorToolbar';
import Action from '../Button/Action';
import Body, { remarkable } from '../Story/Body';
import Autocomplete from 'react-autocomplete';
import './Editor.less';

import { getProjects, setProjects } from '../../actions/projects';

@connect(
  state => ({
    projects: state.projects,
  }),
  { getProjects, setProjects },
)
@injectIntl
class Editor extends React.Component {
  static propTypes = {
    intl: PropTypes.shape().isRequired,
    form: PropTypes.shape().isRequired,
    repository: PropTypes.object,
    title: PropTypes.string,
    topics: PropTypes.arrayOf(PropTypes.string),
    body: PropTypes.string,
    upvote: PropTypes.bool,
    loading: PropTypes.bool,
    isUpdating: PropTypes.bool,
    saving: PropTypes.bool,
    onUpdate: PropTypes.func,
    onSubmit: PropTypes.func,
    onError: PropTypes.func,
    onImageInserted: PropTypes.func,
  };

  static defaultProps = {
    title: '',
    repository: null,
    topics: [],
    body: '',
    upvote: true,
    recentTopics: [],
    popularTopics: [],
    loading: false,
    isUpdating: false,
    saving: false,
    onUpdate: () => {},
    onSubmit: () => {},
    onError: () => {},
    onImageInserted: () => {},
  };

  static hotkeys = {
    h1: 'ctrl+shift+1',
    h2: 'ctrl+shift+2',
    h3: 'ctrl+shift+3',
    h4: 'ctrl+shift+4',
    h5: 'ctrl+shift+5',
    h6: 'ctrl+shift+6',
    bold: 'ctrl+b',
    italic: 'ctrl+i',
    quote: 'ctrl+q',
    link: 'ctrl+k',
    image: 'ctrl+m',
  };

  state = {
    contentHtml: '',
    noContent: false,
    imageUploading: false,
    dropzoneActive: false,
    value: '',
    loading: false,
    loaded: false,
    repository: null,
    noRepository: false,
  };

  constructor (props) {
    super(props)
    this.renderItems = this.renderItems.bind(this);
  }

  renderItems(items) {
    return items;
  }

  componentDidMount() {
    if (this.input) {
      this.input.addEventListener('input', throttle(e => this.renderMarkdown(e.target.value), 500));
      this.input.addEventListener('paste', this.handlePastedImage);
    }

    this.setValues(this.props);

    // eslint-disable-next-line react/no-find-dom-node
    const select = ReactDOM.findDOMNode(this.select);
    if (select) {
      const selectInput = select.querySelector('input,textarea,div[contentEditable]');
      if (selectInput) {
        selectInput.setAttribute('autocorrect', 'off');
        selectInput.setAttribute('autocapitalize', 'none');
      }
    }
  }

  componentWillReceiveProps(nextProps) {
    const { title, topics, body, upvote } = this.props;

    if (this.props.repository !== nextProps.repository) {
      this.setState({
        value: nextProps.repository.full_name,
        repository: nextProps.repository,
      });
    }

    if (
      title !== nextProps.title ||
      topics !== nextProps.topics ||
      body !== nextProps.body ||
      upvote !== nextProps.upvote
    ) {
      this.setValues(nextProps);
    }
  }

  onUpdate = (e, isRepository = false) => {
    const values = isRepository ? this.getValues() : this.getValues(e);

    if (isRepository) {
      this.props.onUpdate({
        ...values,
        repository: e
      });
    } else {
      this.props.onUpdate(values);
    }
  };

  setInput = (input) => {
    if (input && input.refs && input.refs.input) {
      this.originalInput = input.refs.input;
      // eslint-disable-next-line react/no-find-dom-node
      this.input = ReactDOM.findDOMNode(input.refs.input);
    }
  };

  setValues = (post) => {
    this.props.form.setFieldsValue({
      title: post.title,
      topics: post.topics,
      upvote: post.upvote,
    });
    if (this.input) {
      this.input.value = post.body;
      this.renderMarkdown(this.input.value);
      this.resizeTextarea();
    }
  };

  getValues = (e) => {
    // NOTE: antd API is inconsistent and returns event or just value depending of input type.
    // this code extracts value from event based of event type
    // (array or just value for Select, proxy event for inputs and checkboxes)

    const values = {
      ...this.props.form.getFieldsValue(['title', 'topics', 'upvote']),
      body: this.input.value,
    };

    if (!e) return values;

    if (isArray(e)) {
      values.topics = e;
    }else if (e.target.type === 'textarea') {
      values.body = e.target.value;
    } else if (e.target.type === 'text') {
      values.title = e.target.value;
    } else if (e.target.type === 'checkbox') {
      values.upvote = e.target.checked;
    }

    return values;
  };

  resizeTextarea = () => {
    if (this.originalInput) this.originalInput.resizeTextarea();
  };

  //
  // Form validation and handling
  //

  handleSubmit = (e) => {
    // NOTE: Wrapping textarea in getFormDecorator makes it impossible
    // to control its selection what is needed for markdown formatting.
    // This code adds requirement for body input to not be empty.
    e.preventDefault();
    this.setState({ noContent: false, noRepository: false });
    this.props.form.validateFieldsAndScroll((err, values) => {
      if (
        !this.state.repository
      ) {
        this.setState({noRepository: true});
      } else if (!err && this.input.value !== '') {
        this.props.onSubmit({
          ...values,
          repository: this.state.repository,
          body: this.input.value,
        });
      } else if (this.input.value === '') {
        const errors = {
          ...err,
          body: {
            errors: [
              {
                field: 'body',
                message: "Content can't be empty",
              },
            ],
          },
        };
        this.setState({ noContent: true });
        this.props.onError(errors);
      } else {
        this.props.onError(err);
      }
    });
  };

  checkTopics = (rule, value, callback) => {
    if (!value || value.length < 1 || value.length > 4) {
      callback('You have to add 1 to 4 tags');
    }

    value
      .map(topic => ({ topic, valid: /^[a-z0-9]+(-[a-z0-9]+)*$/.test(topic) }))
      .filter(topic => !topic.valid)
      .map(topic => callback(`Tag ${topic.topic} is invalid`));

    callback();
  };

  //
  // Editor methods
  //

  handlePastedImage = (e) => {
    if (e.clipboardData && e.clipboardData.items) {
      const items = e.clipboardData.items;
      Array.from(items).forEach((item) => {
        if (item.kind === 'file') {
          e.preventDefault();

          this.setState({
            imageUploading: true,
          });

          const blob = item.getAsFile();
          this.props.onImageInserted(blob, this.insertImage, () =>
            this.setState({
              imageUploading: false,
            }),
          );
        }
      });
    }
  };

  handleImageChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      this.setState({
        imageUploading: true,
      });
      this.props.onImageInserted(e.target.files[0], this.insertImage, () =>
        this.setState({
          imageUploading: false,
        }),
      );
      // Input reacts on value change, so if user selects the same file nothing will happen.
      // We have to reset its value, so if same image is selected it will emit onChange event.
      e.target.value = '';
    }
  };

  handleDrop = (files) => {
    if (files.length === 0) {
      this.setState({
        dropzoneActive: false,
      });
      return;
    }

    this.setState({
      dropzoneActive: false,
      imageUploading: true,
    });
    let callbacksCount = 0;
    Array.from(files).forEach((item) => {
      this.props.onImageInserted(
        item,
        (image, imageName) => {
          callbacksCount += 1;
          this.insertImage(image, imageName);
          if (callbacksCount === files.length) {
            this.setState({
              imageUploading: false,
            });
          }
        },
        () => {
          this.setState({
            imageUploading: false,
          });
        },
      );
    });
  };

  handleDragEnter = () => this.setState({ dropzoneActive: true });

  handleDragLeave = () => this.setState({ dropzoneActive: false });

  insertAtCursor = (before, after, deltaStart = 0, deltaEnd = 0) => {
    if (!this.input) return;

    const startPos = this.input.selectionStart;
    const endPos = this.input.selectionEnd;
    this.input.value =
      this.input.value.substring(0, startPos) +
      before +
      this.input.value.substring(startPos, endPos) +
      after +
      this.input.value.substring(endPos, this.input.value.length);

    this.input.selectionStart = startPos + deltaStart;
    this.input.selectionEnd = endPos + deltaEnd;
  };

  insertImage = (image, imageName = 'image') => {
    if (!this.input) return;

    const startPos = this.input.selectionStart;
    const endPos = this.input.selectionEnd;
    this.input.value = `${this.input.value.substring(
      0,
      startPos,
    )}![${imageName}](${image})${this.input.value.substring(endPos, this.input.value.length)}\n`;

    this.resizeTextarea();
    this.renderMarkdown(this.input.value);
    this.onUpdate();
  };

  insertCode = (type) => {
    if (!this.input) return;
    this.input.focus();

    switch (type) {
      case 'h1':
        this.insertAtCursor('# ', '', 2, 2);
        break;
      case 'h2':
        this.insertAtCursor('## ', '', 3, 3);
        break;
      case 'h3':
        this.insertAtCursor('### ', '', 4, 4);
        break;
      case 'h4':
        this.insertAtCursor('#### ', '', 5, 5);
        break;
      case 'h5':
        this.insertAtCursor('##### ', '', 6, 6);
        break;
      case 'h6':
        this.insertAtCursor('###### ', '', 7, 7);
        break;
      case 'b':
        this.insertAtCursor('**', '**', 2, 2);
        break;
      case 'i':
        this.insertAtCursor('*', '*', 1, 1);
        break;
      case 'q':
        this.insertAtCursor('> ', '', 2, 2);
        break;
      case 'link':
        this.insertAtCursor('[', '](url)', 1, 1);
        break;
      case 'image':
        this.insertAtCursor('![', '](url)', 2, 2);
        break;
      default:
        break;
    }

    this.resizeTextarea();
    this.renderMarkdown(this.input.value);
    this.onUpdate();
  };

  handlers = {
    h1: () => this.insertCode('h1'),
    h2: () => this.insertCode('h2'),
    h3: () => this.insertCode('h3'),
    h4: () => this.insertCode('h4'),
    h5: () => this.insertCode('h5'),
    h6: () => this.insertCode('h6'),
    bold: () => this.insertCode('b'),
    italic: () => this.insertCode('i'),
    quote: () => this.insertCode('q'),
    link: (e) => {
      e.preventDefault();
      this.insertCode('link');
    },
    image: () => this.insertCode('image'),
  };

  renderMarkdown = (value) => {
    this.setState({
      contentHtml: remarkable.render(value),
    });
  };

  render() {
    const { getFieldDecorator } = this.props.form;
    const { intl, loading, isUpdating, saving, getProjects, projects, setProjects } = this.props;

    return (
      <Form className="Editor" layout="vertical" onSubmit={this.handleSubmit}>
        <Form.Item
          validateStatus={this.state.noRepository ? 'error' : ''}
          help={
            this.state.noRepository &&
            intl.formatMessage({
              id: 'repository_error_empty',
              defaultMessage: "Please enter an existing Github repository",
            })
          }
          label={
            <span className="Editor__label">
              <Icon type='github' /> Github Repository
            </span>
          }
        >
          <Autocomplete
            ref={ search => this.search = search }
            value={ this.state.value }
            inputProps={{
              id: 'search-projects',
              placeholder: 'Browse Github repositories',
              className: 'ant-input ant-input-lg Editor__repository',
              onKeyPress: (event) => {
                const q = event.target.value;

                if (event.key === 'Enter') {
                  event.preventDefault();

                  this.setState({loading: true, loaded: false});
                  this.search.refs.input.click();

                  getProjects(q).then(() => {
                    this.setState({loaded: true, loading: false});
                    this.search.refs.input.click();
                  });
                }
              },
            }}
            items={ projects }
            getItemValue={project => project.full_name}
            onSelect={(value, project) => {
              this.setState({
                value: project.full_name,
                repository: project,
              });
              this.onUpdate(project, true);
            }}
            onChange={(event, value) => {
              this.setState({value});

              if (value === '') {
                setProjects([]);
                this.setState({loaded: false, repository: null});
              }

            }}
            renderItem={(project, isHighlighted) => (
              <div
                className='Topnav__search-item'
                key={project.full_name}
              >
                <span><Icon type='github' /> <b>{project.full_name}</b></span>
                <span>{project.html_url}</span>
              </div>
            )}
            renderMenu={(items, value) => (
              <div className="Topnav__search-menu">
                <div>
                  {items.length === 0 && !this.state.loaded && !this.state.loading && <div className="Topnav__search-tip"><b>Press enter to see results</b></div>}
                  {items.length === 0 && this.state.loaded && <div className="Topnav__search-tip">No projects found</div>}
                  {this.state.loading && <div className="Topnav__search-tip">Loading...</div>}
                  {items.length > 0 && this.renderItems(items)}
                </div>
              </div>
            )}
          />
        </Form.Item>

        <Form.Item
          label={
            <span className="Editor__label">
              Title of Contributor Report
            </span>
          }
        >
          {getFieldDecorator('title', {
            rules: [
              {
                required: true,
                message: intl.formatMessage({
                  id: 'title_error_empty',
                  defaultMessage: 'title_error_empty',
                }),
              },
              {
                max: 255,
                message: intl.formatMessage({
                  id: 'title_error_too_long',
                  defaultMessage: "Title can't be longer than 255 characters.",
                }),
              },
            ],
          })(
            <Input
              ref={(title) => {
                this.title = title;
              }}
              onChange={this.onUpdate}
              className="Editor__title"
              placeholder={intl.formatMessage({
                id: 'title_placeholder',
                defaultMessage: 'Add title',
              })}
            />,
          )}
        </Form.Item>

        <Form.Item
          validateStatus={this.state.noContent ? 'error' : ''}
          help={
            this.state.noContent &&
            intl.formatMessage({
              id: 'story_error_empty',
              defaultMessage: "Story content can't be empty.",
            })
          }
        >

          <div className="WriteTips">
            <h3>Contributor Story</h3>
            <p>Write the story of the contributions you made so far for this Open Source project.</p>
            <ul>
              <li><Icon type="heart" /> Be personal and meaningful. People love to read.</li>
              <li><Icon type="frown" /> Don't cheat. Never report contributions you have already shared. </li>
              <li><Icon type="search" /> Contributions must be verifiable. Provide proof of your work.</li>
              <li><Icon type="like" /> Contributions can be anything, code development, graphic design, social engagement and more.</li>
            </ul>
          </div>

          <EditorToolbar onSelect={this.insertCode} />

          <div className="Editor__dropzone-base">
            <Dropzone
              disableClick
              style={{}}
              accept="image/*"
              onDrop={this.handleDrop}
              onDragEnter={this.handleDragEnter}
              onDragLeave={this.handleDragLeave}
            >
              {this.state.dropzoneActive && (
                <div className="Editor__dropzone">
                  <div>
                    <i className="iconfont icon-picture" />
                    <FormattedMessage id="drop_image" defaultMessage="Drop your images here" />
                  </div>
                </div>
              )}
              <HotKeys keyMap={Editor.hotkeys} handlers={this.handlers}>
                <Input
                  autosize={{ minRows: 6, maxRows: 12 }}
                  onChange={this.onUpdate}
                  ref={ref => this.setInput(ref)}
                  type="textarea"
                  placeholder={intl.formatMessage({
                    id: 'story_placeholder',
                    defaultMessage: 'Write your story...',
                  })}
                />
              </HotKeys>
            </Dropzone>
          </div>
          <p className="Editor__imagebox">
            <input type="file" id="inputfile" onChange={this.handleImageChange} />
            <label htmlFor="inputfile">
              {this.state.imageUploading ? (
                  <Icon type="loading" />
                ) : (
                  <i className="iconfont icon-picture" />
                )}
              {this.state.imageUploading ? (
                  <FormattedMessage id="image_uploading" defaultMessage="Uploading your image..." />
                ) : (
                  <FormattedMessage
                    id="select_or_past_image"
                    defaultMessage="Select image or paste it from the clipboard."
                  />
                )}
            </label>
          </p>
        </Form.Item>
        {this.state.contentHtml && (
          <Form.Item
            label={
              <span className="Editor__label">
                <FormattedMessage id="preview" defaultMessage="Preview" />
              </span>
            }
          >
            <Body full body={this.state.contentHtml} />
          </Form.Item>
        )}
        <Form.Item
          label={
            <span className="Editor__label">
              Tags
            </span>
          }
          extra='Separate tags with commas. Only lowercase letters, numbers and hyphen character is permitted.'
        >
          {getFieldDecorator('topics', {
            rules: [
              {
                required: true,
                message: 'Please enter some tags',
                type: 'array',
              },
              { validator: this.checkTopics },
            ],
          })(
            <Select
              ref={(ref) => {
                this.select = ref;
              }}
              onChange={this.onUpdate}
              className="Editor__topics"
              mode="tags"
              placeholder='Add story topics here'
              dropdownStyle={{ display: 'none' }}
              tokenSeparators={[' ', ',']}
            />,
          )}
        </Form.Item>
        {/*<Form.Item
          className={classNames({ Editor__hidden: isUpdating })}
          label={
            <span className="Editor__label">
              <FormattedMessage id="reward" defaultMessage="Reward" />
            </span>
          }
        >
          {getFieldDecorator('reward', { initialValue: '50' })(
            <Select onChange={this.onUpdate} disabled={isUpdating}>
              <Select.Option value="100">
                <FormattedMessage id="reward_option_100" defaultMessage="100% Steem Power" />
              </Select.Option>
              <Select.Option value="50">
                <FormattedMessage id="reward_option_50" defaultMessage="50% SBD and 50% SP" />
              </Select.Option>
              <Select.Option value="0">
                <FormattedMessage id="reward_option_0" defaultMessage="Declined" />
              </Select.Option>
            </Select>,
          )}
        </Form.Item>*/}
        <Form.Item className={classNames({ Editor__hidden: isUpdating })}>
          {getFieldDecorator('upvote', { valuePropName: 'checked', initialValue: true })(
            <Checkbox onChange={this.onUpdate} disabled={isUpdating}>
              <FormattedMessage id="like_post" defaultMessage="Like this post" />
            </Checkbox>,
          )}
        </Form.Item>
        <div className="Editor__bottom">
            <span className="Editor__bottom__info">
            <i className="iconfont icon-markdown" />{' '}
              <FormattedMessage
                id="markdown_supported"
                defaultMessage="Styling with markdown supported"
              />
            </span>
          <div className="Editor__bottom__right">
            {saving && (
              <span className="Editor__bottom__right__saving">
                <FormattedMessage id="saving" defaultMessage="Saving..." />
              </span>
            )}
            <Form.Item className="Editor__bottom__submit">
              {isUpdating ? (
                  <Action
                    primary
                    loading={loading}
                    disabled={loading}
                    text={intl.formatMessage({
                      id: loading ? 'post_send_progress' : 'post_update_send',
                      defaultMessage: loading ? 'Submitting' : 'Update post',
                    })}
                  />
                ) : (
                  <Action
                    primary
                    loading={loading}
                    disabled={loading}
                    text={intl.formatMessage({
                      id: loading ? 'post_send_progress' : 'post_send',
                      defaultMessage: loading ? 'Submitting' : 'Post',
                    })}
                  />
                )}
            </Form.Item>
          </div>
        </div>
      </Form>
    );
  }
}

export default Form.create()(Editor);
