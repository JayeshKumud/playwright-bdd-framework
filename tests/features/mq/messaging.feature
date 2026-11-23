@mq
Feature: Messaging with ActiveMQ
  Send messages to queues and topics and read them back over AMQP 1.0. Each scenario uses its own new queue or
  topic, so scenarios can run in parallel. Needs a running broker: npm run mq:start (Docker) or your own.

  Background:
    Given a new queue "orders"

  @smoke
  Scenario: A JSON message is read back from a queue
    When I send the JSON message to queue "orders":
      """
      { "orderId": "A-1001", "customer": { "name": "Ada Lovelace" }, "total": 42.5 }
      """
    Then I read a message from queue "orders"
    And the message field "orderId" is "A-1001"
    And the message field "customer.name" is "Ada Lovelace"
    And queue "orders" has no more messages

  Scenario: A selector reads only the matching message
    When I send the text message "first" to queue "orders" with properties:
      | type     | created |
      | priority | 1       |
    And I send the text message "second" to queue "orders" with properties:
      | type     | cancelled |
      | priority | 5         |
    Then I read a message from queue "orders" with selector "type = 'cancelled'"
    And the message text is "second"
    And the message property "priority" is "5"

  Scenario: The message with a given field is found among others
    When I send the JSON message to queue "orders":
      """
      { "orderId": "A-1" }
      """
    And I send the JSON message to queue "orders":
      """
      { "orderId": "A-2" }
      """
    Then queue "orders" has a JSON message where "orderId" is "A-2"

  Scenario: Every topic subscriber gets a published message
    Given a new topic "order-events"
    And I subscribe to topic "order-events"
    When I publish the JSON message to topic "order-events":
      """
      { "event": "order.created", "orderId": "A-2002" }
      """
    Then the subscription to topic "order-events" receives a JSON message where "orderId" is "A-2002"
    And the message field "event" is "order.created"
