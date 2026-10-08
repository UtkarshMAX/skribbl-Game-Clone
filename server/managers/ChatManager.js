class ChatManager {
  constructor() {
    this.messages = [];
  }

  addMessage(message) {
    this.messages.push(message);
    if (this.messages.length > 100) {
        this.messages.shift();
    }
  }

  getMessages() {
    return this.messages;
  }
}

export default ChatManager;